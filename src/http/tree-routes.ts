import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getUserSession } from '../auth/session.js'
import {
  getResolvedTree,
  listTreeSummaries,
  searchTruths,
  deleteTree,
} from '../core/service.js'
import { createNode } from '../core/create.js'
import { updateNode, moveNode, deleteNode } from '../core/write.js'
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
// Body schemas for the write routes.
// ---------------------------------------------------------------------------

const createBody = z.object({
  parentId: z.string().nullable(),
  label: z.string().min(1),
  content: z.string().min(1),
  hardnessSet: z.number().min(0).max(100).nullable().optional(),
})
const updateBody = z.object({
  content: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  hardnessSet: z.number().min(0).max(100).nullable().optional(),
  confirm: z.boolean().optional(),
})
const moveBody = z.object({
  newParentId: z.string().nullable(),
  confirm: z.boolean().optional(),
})

/** Runs a core use-case and maps thrown domain errors to 404 (not found) or 400. */
const sendOrFail = async (reply: FastifyReply, run: () => Promise<unknown>): Promise<unknown> => {
  try {
    return reply.send(await run())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(/not found/i.test(message) ? 404 : 400).send({ error: message })
  }
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

  // POST /api/trees/:treeId/nodes — create a truth. parentId null = a new root.
  app.post<{ Params: { treeId: string } }>(
    '/api/trees/:treeId/nodes',
    { preHandler: guard },
    async (request, reply) => {
      const parsed = createBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues })
      }
      return sendOrFail(reply, () =>
        createNode(
          repoFor(request),
          {
            treeId: request.params.treeId,
            parentId: parsed.data.parentId,
            label: parsed.data.label,
            content: parsed.data.content,
            hardnessSet: parsed.data.hardnessSet ?? null,
          },
          deps.now(),
        ),
      )
    },
  )

  // PATCH /api/trees/:treeId/nodes/:nodeId — edit; protected returns a cascade preview.
  app.patch<{ Params: { treeId: string; nodeId: string } }>(
    '/api/trees/:treeId/nodes/:nodeId',
    { preHandler: guard },
    async (request, reply) => {
      const parsed = updateBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues })
      }
      return sendOrFail(reply, () =>
        updateNode(
          repoFor(request),
          {
            treeId: request.params.treeId,
            nodeId: request.params.nodeId,
            content: parsed.data.content,
            label: parsed.data.label,
            hardnessSet: parsed.data.hardnessSet,
            confirm: parsed.data.confirm,
          },
          deps.now(),
        ),
      )
    },
  )

  // POST /api/trees/:treeId/nodes/:nodeId/move — re-hang under a new parent.
  app.post<{ Params: { treeId: string; nodeId: string } }>(
    '/api/trees/:treeId/nodes/:nodeId/move',
    { preHandler: guard },
    async (request, reply) => {
      const parsed = moveBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues })
      }
      return sendOrFail(reply, () =>
        moveNode(
          repoFor(request),
          {
            treeId: request.params.treeId,
            nodeId: request.params.nodeId,
            newParentId: parsed.data.newParentId,
            confirm: parsed.data.confirm,
          },
          deps.now(),
        ),
      )
    },
  )

  // DELETE /api/trees/:treeId/nodes/:nodeId?confirm=true — delete node + descendants.
  app.delete<{ Params: { treeId: string; nodeId: string }; Querystring: { confirm?: string } }>(
    '/api/trees/:treeId/nodes/:nodeId',
    { preHandler: guard },
    async (request, reply) => {
      return sendOrFail(reply, () =>
        deleteNode(
          repoFor(request),
          {
            treeId: request.params.treeId,
            nodeId: request.params.nodeId,
            confirm: request.query.confirm === 'true',
          },
          deps.now(),
        ),
      )
    },
  )

  // DELETE /api/trees/:treeId?confirm=true — delete a whole tree (preview without confirm).
  app.delete<{ Params: { treeId: string }; Querystring: { confirm?: string } }>(
    '/api/trees/:treeId',
    { preHandler: guard },
    async (request, reply) => {
      const repo = repoFor(request)
      const treeId = request.params.treeId
      if (request.query.confirm !== 'true') {
        const summaries = await listTreeSummaries(repo)
        const nodeCount = summaries.find((s) => s.treeId === treeId)?.nodeCount ?? 0
        return reply.send({ requiresConfirmation: true, treeId, nodeCount })
      }
      const removed = await deleteTree(repo, treeId)
      return reply.send({ deleted: treeId, removed })
    },
  )
}
