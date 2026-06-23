import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getUserSession } from '../auth/session.js'
import { getResolvedTree, listTreeSummaries, searchTruths } from '../core/service.js'
import type { TreeStore } from '../core/repository.js'

// ---------------------------------------------------------------------------
// Fastify request augmentation — typed per-request userId for the tree routes.
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    treeUserId: string
  }
}

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface TreeRouteDeps {
  treeStore: TreeStore
  now: () => Date
}

// ---------------------------------------------------------------------------
// requireSession preHandler — browser session cookie, not a bearer token.
// ---------------------------------------------------------------------------

const requireSession =
  () =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = getUserSession(request)
    if (userId === null) {
      await reply.code(401).send({ error: 'unauthorized' })
      return
    }
    request.treeUserId = userId
  }

// ---------------------------------------------------------------------------
// Routes — a thin REST facade over the same core read use-cases the MCP server
// uses. Storage is scoped to the session user; the core decides hardness.
// ---------------------------------------------------------------------------

export const registerTreeRoutes = (app: FastifyInstance, deps: TreeRouteDeps): void => {
  app.decorateRequest('treeUserId', '')
  const guard = requireSession()
  const repoFor = (request: FastifyRequest) => deps.treeStore.forUser(request.treeUserId)

  // GET /api/trees — the user's trees with node counts.
  app.get('/api/trees', { preHandler: guard }, async (request, reply) => {
    return reply.send(await listTreeSummaries(repoFor(request)))
  })

  // GET /api/trees/:treeId — the resolved nested forest, hardness + protected per node.
  app.get<{ Params: { treeId: string } }>(
    '/api/trees/:treeId',
    { preHandler: guard },
    async (request, reply) => {
      return reply.send(await getResolvedTree(repoFor(request), request.params.treeId, deps.now()))
    },
  )

  // GET /api/trees/:treeId/search?q=... — matching resolved nodes, for large trees.
  app.get<{ Params: { treeId: string }; Querystring: { q?: string } }>(
    '/api/trees/:treeId/search',
    { preHandler: guard },
    async (request, reply) => {
      const q = request.query.q
      if (!q || q.trim() === '') return reply.code(400).send({ error: 'query q is required' })
      return reply.send(await searchTruths(repoFor(request), request.params.treeId, q, deps.now()))
    },
  )
}
