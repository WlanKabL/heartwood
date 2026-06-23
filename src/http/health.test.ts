import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { buildServer } from './server.js'
import { setupPostgresTests, getDb } from '../storage/postgres-test-setup.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { PostgresWorkflowStore } from '../storage/postgres-workflows.js'

const SESSION_SECRET = 'test-session-secret-at-least-32-chars-long'

setupPostgresTests()

const buildApp = () =>
  buildServer({
    db: getDb(),
    treeStore: new PostgresTreeStore(getDb()),
    workflowStore: new PostgresWorkflowStore(getDb()),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    sessionSecret: SESSION_SECRET,
    github: { clientId: 'dummy', clientSecret: 'dummy' },
    publicUrl: 'http://localhost:8722',
  })

describe('GET /health', () => {
  it('returns 200 { status: ok } with no auth header', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>()).toEqual({ status: 'ok' })

    await app.close()
  })

  it('returns 200 even when an Authorization header is present (no auth enforcement)', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { authorization: 'Bearer invalid-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ status: string }>().status).toBe('ok')

    await app.close()
  })
})
