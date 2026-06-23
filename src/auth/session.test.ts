import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { setUserSession, getUserSession, clearSession } from './session.js'

/** Derive a 32-byte key the same way buildServer does. */
const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()

const buildTestApp = () => {
  const app = Fastify()
  app.register(fastifyCookie)
  app.register(fastifySecureSession, { key: sessionKey('test-secret-must-be-at-least-32-chars') })

  app.post('/set', async (request, reply) => {
    const body = request.body as { userId: string }
    setUserSession(reply, body.userId)
    return reply.code(200).send({ ok: true })
  })

  app.get('/get', async (request, reply) => {
    const userId = getUserSession(request)
    return reply.send({ userId })
  })

  app.post('/clear', async (request, reply) => {
    clearSession(reply)
    return reply.code(200).send({ ok: true })
  })

  return app
}

/**
 * Extract the Set-Cookie header from a Fastify inject response.
 * Returns just the cookie value (the part before the first ";").
 */
const extractCookie = (setCookieHeader: string | string[] | undefined): string => {
  const value = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  if (!value) throw new Error('no Set-Cookie header in response')
  return value.split(';')[0] ?? value
}

describe('session helpers', () => {
  it('setUserSession / getUserSession: cookie survives a round-trip', async () => {
    const app = buildTestApp()
    await app.ready()

    // Set the session.
    const setRes = await app.inject({
      method: 'POST',
      url: '/set',
      payload: { userId: 'user-abc' },
      headers: { 'content-type': 'application/json' },
    })
    expect(setRes.statusCode).toBe(200)

    const cookie = extractCookie(setRes.headers['set-cookie'])

    // Read it back in a second request carrying the cookie.
    const getRes = await app.inject({
      method: 'GET',
      url: '/get',
      headers: { cookie },
    })
    expect(getRes.statusCode).toBe(200)
    const body = getRes.json<{ userId: string | null }>()
    expect(body.userId).toBe('user-abc')

    await app.close()
  })

  it('getUserSession returns null when no session cookie is present', async () => {
    const app = buildTestApp()
    await app.ready()

    const getRes = await app.inject({ method: 'GET', url: '/get' })
    expect(getRes.statusCode).toBe(200)
    expect(getRes.json<{ userId: string | null }>().userId).toBeNull()

    await app.close()
  })

  it('clearSession: subsequent read returns null', async () => {
    const app = buildTestApp()
    await app.ready()

    // Establish a session.
    const setRes = await app.inject({
      method: 'POST',
      url: '/set',
      payload: { userId: 'user-xyz' },
      headers: { 'content-type': 'application/json' },
    })
    const cookie = extractCookie(setRes.headers['set-cookie'])

    // Clear it.
    const clearRes = await app.inject({
      method: 'POST',
      url: '/clear',
      headers: { cookie },
    })
    expect(clearRes.statusCode).toBe(200)
    const clearedCookie = extractCookie(clearRes.headers['set-cookie'])

    // Read with the cleared cookie — should be null.
    const getRes = await app.inject({
      method: 'GET',
      url: '/get',
      headers: { cookie: clearedCookie },
    })
    expect(getRes.json<{ userId: string | null }>().userId).toBeNull()

    await app.close()
  })
})
