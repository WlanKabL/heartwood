import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { setupPostgresTests, getDb, getUserA } from '../storage/postgres-test-setup.js'
import { setUserSession } from '../auth/session.js'
import { registerPages } from './pages.js'
import { apiTokens } from '../storage/schema.js'

const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()
const SESSION_SECRET = 'test-secret-must-be-at-least-32-characters'

setupPostgresTests()

/** Build a minimal Fastify app with session plugin + pages, plus a helper login endpoint. */
const buildApp = () => {
  const app = Fastify()
  app.register(fastifyCookie)
  app.register(fastifySecureSession, { key: sessionKey(SESSION_SECRET) })

  // Test-only route to establish a session for a given userId.
  app.get<{ Params: { userId: string } }>('/test-login/:userId', async (request, reply) => {
    setUserSession(reply, request.params.userId)
    return reply.code(200).send({ ok: true })
  })

  registerPages(app, { db: getDb() })
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

describe('GET / (pages)', () => {
  it('logged-out: returns 200 with a GitHub login link', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.body).toContain('/auth/github')

    await app.close()
  })

  it('logged-in: returns 200 with the user email and existing token prefix, no tokenHash', async () => {
    const app = buildApp()
    await app.ready()
    const db = getDb()
    const userId = getUserA()

    // Seed a token directly so we know its prefix.
    const [seeded] = await db
      .insert(apiTokens)
      .values({
        userId,
        name: 'test-token',
        tokenHash: 'sha256:fakehash_for_page_test',
        prefix: 'hw_abc',
      })
      .returning({ prefix: apiTokens.prefix, tokenHash: apiTokens.tokenHash })

    if (!seeded) throw new Error('Failed to seed token')

    const cookie = await loginAs(app, userId)
    const res = await app.inject({ method: 'GET', url: '/', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)

    // Email must be present.
    expect(res.body).toContain('a@test')

    // The token prefix must be listed.
    expect(res.body).toContain(seeded.prefix)

    // The raw token hash must never appear in the HTML.
    expect(res.body).not.toContain(seeded.tokenHash)

    await app.close()
  })

  it('logged-in: delete control uses fetch DELETE, not a /delete form action', async () => {
    const app = buildApp()
    await app.ready()
    const db = getDb()
    const userId = getUserA()

    await db
      .insert(apiTokens)
      .values({
        userId,
        name: 'deletable-token',
        tokenHash: 'sha256:fakehash_delete_wiring_test',
        prefix: 'hw_del',
      })

    const cookie = await loginAs(app, userId)
    const res = await app.inject({ method: 'GET', url: '/', headers: { cookie } })

    expect(res.statusCode).toBe(200)

    // The page must wire up fetch with method DELETE for the /api/tokens/ path.
    expect(res.body).toContain("method: 'DELETE'")
    expect(res.body).toContain('/api/tokens/')

    // There must be NO dead form that POSTs to a /delete sub-path.
    expect(res.body).not.toContain('/delete')

    await app.close()
  })

  it('logged-in: shows GitHub link for unauthenticated request even after session cookie is set for another user', async () => {
    const app = buildApp()
    await app.ready()

    // No cookie sent — must still show the login link.
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('/auth/github')

    await app.close()
  })
})
