import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { setupPostgresTests, getDb, getUserA, getUserB } from '../storage/postgres-test-setup.js'
import { setUserSession } from '../auth/session.js'
import { registerApiRoutes } from './api-routes.js'
import { apiTokens } from '../storage/schema.js'
import { eq } from 'drizzle-orm'

const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()
const SESSION_SECRET = 'test-secret-must-be-at-least-32-characters'

setupPostgresTests()

/** Build a minimal Fastify app with session plugin + api routes, plus a helper login endpoint. */
const buildApp = () => {
  const app = Fastify()
  app.register(fastifyCookie)
  app.register(fastifySecureSession, { key: sessionKey(SESSION_SECRET) })

  // Test-only route to establish a session for a given userId.
  app.get<{ Params: { userId: string } }>('/test-login/:userId', async (request, reply) => {
    setUserSession(reply, request.params.userId)
    return reply.code(200).send({ ok: true })
  })

  registerApiRoutes(app, { db: getDb() })
  return app
}

/** Hit /test-login/:userId and return the Set-Cookie value. */
const loginAs = async (app: ReturnType<typeof buildApp>, userId: string): Promise<string> => {
  const res = await app.inject({ method: 'GET', url: `/test-login/${userId}` })
  const raw = res.headers['set-cookie']
  const header = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return header.split(';')[0] ?? ''
}

// ---------------------------------------------------------------------------

describe('GET /api/me', () => {
  it('returns session user info', async () => {
    const app = buildApp()
    await app.ready()

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ id: string; email: string }>()
    expect(body.id).toBe(getUserA())
    expect(body.email).toBe('a@test')

    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json<{ error: string }>().error).toBe('unauthorized')

    await app.close()
  })
})

// ---------------------------------------------------------------------------

describe('POST /api/tokens', () => {
  it('creates a token and returns raw exactly once', async () => {
    const app = buildApp()
    await app.ready()

    const cookie = await loginAs(app, getUserA())

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'my-token' },
    })

    expect(createRes.statusCode).toBe(201)
    const created = createRes.json<{ id: string; name: string; prefix: string; raw: string }>()
    expect(typeof created.raw).toBe('string')
    expect(created.raw.startsWith('hw_')).toBe(true)
    expect(typeof created.prefix).toBe('string')
    expect(created.name).toBe('my-token')

    // Verify raw is NOT present in the list.
    const listRes = await app.inject({ method: 'GET', url: '/api/tokens', headers: { cookie } })
    expect(listRes.statusCode).toBe(200)
    const tokens = listRes.json<Record<string, unknown>[]>()
    expect(tokens).toHaveLength(1)
    const listed = tokens[0]!
    expect(listed['id']).toBe(created.id)
    expect(listed['prefix']).toBe(created.prefix)
    expect('raw' in listed).toBe(false)
    expect('tokenHash' in listed).toBe(false)

    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'x' },
    })
    expect(res.statusCode).toBe(401)

    await app.close()
  })
})

// ---------------------------------------------------------------------------

describe('GET /api/tokens', () => {
  it('lists only the session user tokens', async () => {
    const app = buildApp()
    await app.ready()
    const db = getDb()

    const cookieA = await loginAs(app, getUserA())
    const cookieB = await loginAs(app, getUserB())

    // Create one token for A and one for B.
    await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie: cookieA, 'content-type': 'application/json' },
      payload: { name: 'token-a' },
    })
    await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie: cookieB, 'content-type': 'application/json' },
      payload: { name: 'token-b' },
    })

    const listResA = await app.inject({ method: 'GET', url: '/api/tokens', headers: { cookie: cookieA } })
    expect(listResA.statusCode).toBe(200)
    const tokensA = listResA.json<{ name: string }[]>()
    expect(tokensA).toHaveLength(1)
    expect(tokensA[0]!.name).toBe('token-a')

    void db

    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/tokens' })
    expect(res.statusCode).toBe(401)

    await app.close()
  })
})

// ---------------------------------------------------------------------------

describe('DELETE /api/tokens/:id', () => {
  it('deletes own token with 204', async () => {
    const app = buildApp()
    await app.ready()
    const db = getDb()

    const cookie = await loginAs(app, getUserA())

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'delete-me' },
    })
    const { id } = createRes.json<{ id: string }>()

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/tokens/${id}`,
      headers: { cookie },
    })
    expect(delRes.statusCode).toBe(204)

    // Confirm the row is gone.
    const rows = await db.select().from(apiTokens).where(eq(apiTokens.id, id))
    expect(rows).toHaveLength(0)

    await app.close()
  })

  it('returns 404 when userA tries to delete userB token (cross-user ownership)', async () => {
    const app = buildApp()
    await app.ready()
    const db = getDb()

    // Create a token for B.
    const cookieB = await loginAs(app, getUserB())
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie: cookieB, 'content-type': 'application/json' },
      payload: { name: 'token-owned-by-b' },
    })
    const { id } = createRes.json<{ id: string }>()

    // Try to delete it as A.
    const cookieA = await loginAs(app, getUserA())
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/tokens/${id}`,
      headers: { cookie: cookieA },
    })
    expect(delRes.statusCode).toBe(404)
    expect(delRes.json<{ error: string }>().error).toBe('not found')

    // The token must still exist.
    const rows = await db.select().from(apiTokens).where(eq(apiTokens.id, id))
    expect(rows).toHaveLength(1)

    await app.close()
  })

  it('returns 404 for a completely missing id', async () => {
    const app = buildApp()
    await app.ready()

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/tokens/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(404)

    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/tokens/00000000-0000-0000-0000-000000000000',
    })
    expect(res.statusCode).toBe(401)

    await app.close()
  })
})
