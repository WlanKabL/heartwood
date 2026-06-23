import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { setupPostgresTests, getDb, getUserA, getUserB } from '../storage/postgres-test-setup.js'
import { setUserSession } from '../auth/session.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { registerTreeRoutes } from './tree-routes.js'
import type { TreeNode } from '../core/types.js'

const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()
const SESSION_SECRET = 'test-secret-must-be-at-least-32-characters'
const fixedNow = (): Date => new Date('2026-01-01T00:00:00.000Z')

setupPostgresTests()

const buildApp = () => {
  const app = Fastify()
  app.register(fastifyCookie)
  app.register(fastifySecureSession, { key: sessionKey(SESSION_SECRET) })
  app.get<{ Params: { userId: string } }>('/test-login/:userId', async (request, reply) => {
    setUserSession(reply, request.params.userId)
    return reply.code(200).send({ ok: true })
  })
  registerTreeRoutes(app, { treeStore: new PostgresTreeStore(getDb()), now: fixedNow })
  return app
}

const loginAs = async (app: ReturnType<typeof buildApp>, userId: string): Promise<string> => {
  const res = await app.inject({ method: 'GET', url: `/test-login/${userId}` })
  const raw = res.headers['set-cookie']
  const header = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return header.split(';')[0] ?? ''
}

const node = (
  over: Partial<TreeNode> & Pick<TreeNode, 'id' | 'treeId' | 'label' | 'content'>,
): TreeNode => ({
  parentId: null,
  hardnessSet: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastConfirmedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('GET /api/trees', () => {
  it('returns the session user tree summaries', async () => {
    const app = buildApp()
    await app.ready()
    const repo = new PostgresTreeStore(getDb()).forUser(getUserA())
    await repo.insertNode(node({ id: 'a1', treeId: 'keeperlog', label: 'identity', content: 'x' }))
    await repo.insertNode(
      node({ id: 'a2', treeId: 'keeperlog', parentId: 'a1', label: 'voice', content: 'y' }),
    )

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ treeId: string; nodeCount: number }[]>()
    expect(body).toEqual([{ treeId: 'keeperlog', nodeCount: 2 }])
    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/api/trees' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('never shows another user trees', async () => {
    const app = buildApp()
    await app.ready()
    await new PostgresTreeStore(getDb())
      .forUser(getUserB())
      .insertNode(node({ id: 'b1', treeId: 'keeperlog', label: 'identity', content: 'b-secret' }))

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees', headers: { cookie } })
    expect(res.json()).toEqual([])
    await app.close()
  })
})

describe('GET /api/trees/:treeId', () => {
  it('returns the resolved nested forest with hardness', async () => {
    const app = buildApp()
    await app.ready()
    const repo = new PostgresTreeStore(getDb()).forUser(getUserA())
    await repo.insertNode(node({ id: 'r', treeId: 'kl', label: 'identity', content: 'root' }))
    await repo.insertNode(
      node({ id: 'c', treeId: 'kl', parentId: 'r', label: 'leaf', content: 'child' }),
    )

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    const forest = res.json<
      { id: string; effectiveHardness: number; protected: boolean; children: unknown[] }[]
    >()
    expect(forest).toHaveLength(1)
    expect(forest[0]!.id).toBe('r')
    expect(typeof forest[0]!.effectiveHardness).toBe('number')
    expect(forest[0]!.children).toHaveLength(1)
    await app.close()
  })

  it('returns an empty forest for another user tree (isolation)', async () => {
    const app = buildApp()
    await app.ready()
    await new PostgresTreeStore(getDb())
      .forUser(getUserB())
      .insertNode(node({ id: 'b', treeId: 'kl', label: 'identity', content: 'b-secret' }))
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl', headers: { cookie } })
    expect(res.json()).toEqual([])
    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

describe('GET /api/trees/:treeId/search', () => {
  it('returns matching resolved nodes', async () => {
    const app = buildApp()
    await app.ready()
    const repo = new PostgresTreeStore(getDb()).forUser(getUserA())
    await repo.insertNode(
      node({ id: 'r', treeId: 'kl', label: 'identity', content: 'hospital software' }),
    )
    await repo.insertNode(
      node({ id: 'c', treeId: 'kl', parentId: 'r', label: 'voice', content: 'calm tone' }),
    )

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({
      method: 'GET',
      url: '/api/trees/kl/search?q=calm',
      headers: { cookie },
    })

    expect(res.statusCode).toBe(200)
    const hits = res.json<{ id: string }[]>()
    expect(hits.map((h) => h.id)).toEqual(['c'])
    await app.close()
  })

  it('returns 400 when q is missing', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl/search', headers: { cookie } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
