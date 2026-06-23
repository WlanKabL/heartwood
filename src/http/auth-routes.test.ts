import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { completeGithubLogin } from './auth-routes.js'
import { setupPostgresTests, getDb } from '../storage/postgres-test-setup.js'
import { getUserSession } from '../auth/session.js'

const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()
const SESSION_SECRET = 'test-secret-must-be-at-least-32-characters'

setupPostgresTests()

describe('completeGithubLogin', () => {
  it('creates the user, sets the session, and redirects to /', async () => {
    const db = getDb()

    const app = Fastify()
    app.register(fastifyCookie)
    app.register(fastifySecureSession, { key: sessionKey(SESSION_SECRET) })

    // Route that delegates to completeGithubLogin.
    app.get('/test-login', async (request, reply) => {
      await completeGithubLogin(db, reply, {
        githubId: 'gh-complete-001',
        email: 'eve@example.com',
        displayName: 'Eve',
      })
      return reply
    })

    // Route to read the session so we can verify it was set.
    app.get('/whoami', async (request, reply) => {
      return reply.send({ userId: getUserSession(request) })
    })

    await app.ready()

    // Trigger the login.
    const loginRes = await app.inject({ method: 'GET', url: '/test-login' })
    expect(loginRes.statusCode).toBe(302)
    expect(loginRes.headers['location']).toBe('/')

    // The Set-Cookie header must be present.
    const rawCookie = loginRes.headers['set-cookie']
    const cookieHeader = Array.isArray(rawCookie) ? (rawCookie[0] ?? '') : (rawCookie ?? '')
    const cookie = cookieHeader.split(';')[0] ?? ''
    expect(cookie.length).toBeGreaterThan(0)

    // A follow-up request with that cookie should return the userId.
    const whoamiRes = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { cookie },
    })
    expect(whoamiRes.statusCode).toBe(200)
    const body = whoamiRes.json<{ userId: string | null }>()
    expect(typeof body.userId).toBe('string')
    expect((body.userId ?? '').length).toBeGreaterThan(0)

    await app.close()
  })

  it('is idempotent: second login with same githubId returns the same userId', async () => {
    const db = getDb()
    const redirectSpy = vi.fn().mockResolvedValue(undefined)

    // Build a minimal fake reply that records the userId set on the session.
    let capturedUserId: string | null = null

    const app = Fastify()
    app.register(fastifyCookie)
    app.register(fastifySecureSession, { key: sessionKey(SESSION_SECRET) })

    app.get('/test-login-idempotent', async (request, reply) => {
      // Suppress actual redirect so inject doesn't follow it.
      reply.redirect = redirectSpy as typeof reply.redirect
      await completeGithubLogin(db, reply, {
        githubId: 'gh-complete-002',
        email: 'frank@example.com',
        displayName: 'Frank',
      })
      capturedUserId = getUserSession(request)
      return reply.code(200).send({ ok: true })
    })

    await app.ready()

    await app.inject({ method: 'GET', url: '/test-login-idempotent' })
    const firstUserId = capturedUserId

    await app.inject({ method: 'GET', url: '/test-login-idempotent' })
    const secondUserId = capturedUserId

    expect(firstUserId).not.toBeNull()
    expect(secondUserId).toBe(firstUserId)

    await app.close()
  })
})
