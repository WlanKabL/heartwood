import { createHash } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyFormbody from '@fastify/formbody'
import fastifySecureSession from '@fastify/secure-session'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMcpServer } from '../mcp/server.js'
import { getProtectedNodes } from '../core/service.js'
import { resolveToken } from '../auth/tokens.js'
import type { Db } from '../storage/db.js'
import type { TreeStore } from '../core/repository.js'
import type { WorkflowStore } from '../core/workflow-repository.js'
import { registerAuthRoutes } from './auth-routes.js'
import { registerApiRoutes } from './api-routes.js'
import { registerTreeRoutes } from './tree-routes.js'
import { registerPages } from './pages.js'

export interface ServerDeps {
  db: Db
  treeStore: TreeStore
  workflowStore: WorkflowStore
  now: () => Date
  sessionSecret: string
  github: { clientId: string; clientSecret: string }
  publicUrl: string
}

/** secure-session needs a 32-byte key; derive it deterministically from the secret. */
const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()

/**
 * Fastify app. /mcp speaks MCP over Streamable HTTP, GET /trees/:treeId/roots serves the
 * protected core for the session hook. Both resolve the bearer token to a user per request
 * and scope storage to that user, so two tenants never see each other's trees.
 *
 * Only the cookie/session/form plugins are registered here. Auth and session ROUTES are a
 * later task; registering the plugins now lets those routes mount without re-wiring.
 */
export const buildServer = (deps: ServerDeps): FastifyInstance => {
  const app = Fastify()

  app.register(fastifyCookie)
  app.register(fastifyFormbody)
  app.register(fastifySecureSession, {
    key: sessionKey(deps.sessionSecret),
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.publicUrl.startsWith('https'),
    },
  })

  registerAuthRoutes(app, {
    db: deps.db,
    github: deps.github,
    publicUrl: deps.publicUrl,
  })

  registerApiRoutes(app, { db: deps.db })

  registerTreeRoutes(app, {
    treeStore: deps.treeStore,
    workflowStore: deps.workflowStore,
    now: deps.now,
  })

  registerPages(app, { db: deps.db })

  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok' })
  })

  app.all('/mcp', async (request, reply) => {
    const userId = await resolveToken(deps.db, request.headers.authorization, deps.now)
    if (userId === null) {
      return reply
        .code(401)
        .header('www-authenticate', 'Bearer')
        .send({ error: 'unauthorized' })
    }

    const mcpDeps = {
      repo: deps.treeStore.forUser(userId),
      workflows: deps.workflowStore.forUser(userId),
      now: deps.now,
    }
    const server = buildMcpServer(mcpDeps)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    // Fastify owns the socket once we hijack; tie transport + server lifetime to it.
    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })

    await server.connect(transport)

    // Yield the socket before driving the transport so Fastify sends no response of its own.
    reply.hijack()

    // Fastify already parsed the JSON body; hand it to the transport as the third argument
    // so it does not try to re-read an already-consumed stream.
    await transport.handleRequest(request.raw, reply.raw, request.body)
    return reply
  })

  app.get<{ Params: { treeId: string } }>('/trees/:treeId/roots', async (request, reply) => {
    const userId = await resolveToken(deps.db, request.headers.authorization, deps.now)
    if (userId === null) {
      return reply
        .code(401)
        .header('www-authenticate', 'Bearer')
        .send({ error: 'unauthorized' })
    }

    const repo = deps.treeStore.forUser(userId)
    return reply.send(await getProtectedNodes(repo, request.params.treeId, deps.now()))
  })

  return app
}
