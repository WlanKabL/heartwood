import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getUserSession } from '../auth/session.js'
import { generateToken } from '../auth/tokens.js'
import { users, apiTokens } from '../storage/schema.js'
import type { Db } from '../storage/db.js'

// ---------------------------------------------------------------------------
// Fastify request augmentation — typed userId decoration, no any/as unknown.
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ApiRouteDeps {
  db: Db
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createTokenBody = z.object({ name: z.string().min(1) })

// ---------------------------------------------------------------------------
// requireSession preHandler
// ---------------------------------------------------------------------------

const requireSession =
  (app: FastifyInstance) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = getUserSession(request)
    if (userId === null) {
      await reply.code(401).send({ error: 'unauthorized' })
      return
    }
    request.userId = userId
  }

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const registerApiRoutes = (app: FastifyInstance, deps: ApiRouteDeps): void => {
  // Decorate request with userId so the augmented type is satisfied.
  app.decorateRequest('userId', '')

  const guard = requireSession(app)

  // GET /api/me
  app.get('/api/me', { preHandler: guard }, async (request, reply) => {
    const [user] = await deps.db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, request.userId))

    if (!user) return reply.code(404).send({ error: 'not found' })
    return reply.send(user)
  })

  // GET /api/tokens
  app.get('/api/tokens', { preHandler: guard }, async (request, reply) => {
    const rows = await deps.db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, request.userId))

    return reply.send(rows)
  })

  // POST /api/tokens
  app.post('/api/tokens', { preHandler: guard }, async (request, reply) => {
    const parsed = createTokenBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues })
    }

    const { name } = parsed.data
    const { raw, hash, prefix } = generateToken()

    const [inserted] = await deps.db
      .insert(apiTokens)
      .values({ userId: request.userId, name, tokenHash: hash, prefix })
      .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix })

    if (!inserted) return reply.code(500).send({ error: 'insert failed' })

    return reply.code(201).send({ id: inserted.id, name: inserted.name, prefix: inserted.prefix, raw })
  })

  // DELETE /api/tokens/:id
  app.delete<{ Params: { id: string } }>(
    '/api/tokens/:id',
    { preHandler: guard },
    async (request, reply) => {
      const deleted = await deps.db
        .delete(apiTokens)
        .where(and(eq(apiTokens.id, request.params.id), eq(apiTokens.userId, request.userId)))
        .returning({ id: apiTokens.id })

      if (deleted.length === 0) {
        return reply.code(404).send({ error: 'not found' })
      }

      return reply.code(204).send()
    },
  )
}
