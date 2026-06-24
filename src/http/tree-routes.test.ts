import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { setupPostgresTests, getDb, getUserA, getUserB } from '../storage/postgres-test-setup.js'
import { setUserSession } from '../auth/session.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { PostgresWorkflowStore } from '../storage/postgres-workflows.js'
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
  registerTreeRoutes(app, {
    treeStore: new PostgresTreeStore(getDb()),
    workflowStore: new PostgresWorkflowStore(getDb()),
    now: fixedNow,
  })
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

// ---------------------------------------------------------------------------
// Write endpoints
// ---------------------------------------------------------------------------

interface NodeBody {
  id: string
  label: string
  content: string
  protected: boolean
  parentId: string | null
  depthFromRoot: number
}
const createNodeReq = async (
  app: ReturnType<typeof buildApp>,
  cookie: string,
  treeId: string,
  body: { parentId: string | null; label: string; content: string; hardnessSet?: number | null },
): Promise<{ node: NodeBody }> => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/trees/${treeId}/nodes`,
    headers: { cookie, 'content-type': 'application/json' },
    payload: body,
  })
  return res.json<{ node: NodeBody }>()
}

describe('POST /api/trees/:treeId/nodes', () => {
  it('creates a root (protected) and a nested child', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())

    const rootRes = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/nodes',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { parentId: null, label: 'identity', content: 'the core truth' },
    })
    expect(rootRes.statusCode).toBe(200)
    const root = rootRes.json<{ node: NodeBody }>()
    expect(root.node.label).toBe('identity')
    expect(root.node.protected).toBe(true)

    const child = await createNodeReq(app, cookie, 'kl', {
      parentId: root.node.id,
      label: 'detail',
      content: 'a detail',
    })
    expect(child.node.parentId).toBe(root.node.id)
    await app.close()
  })

  it('returns 404 when the parent does not exist', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/nodes',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { parentId: 'missing', label: 'x', content: 'y' },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/nodes',
      headers: { 'content-type': 'application/json' },
      payload: { parentId: null, label: 'x', content: 'y' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

describe('PATCH /api/trees/:treeId/nodes/:nodeId', () => {
  it('edits a soft leaf directly', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const root = await createNodeReq(app, cookie, 'kl', { parentId: null, label: 'r', content: 'root' })
    const branch = await createNodeReq(app, cookie, 'kl', { parentId: root.node.id, label: 'b', content: 'branch' })
    const leaf = await createNodeReq(app, cookie, 'kl', { parentId: branch.node.id, label: 'l', content: 'leaf' })
    expect(leaf.node.protected).toBe(false)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/trees/kl/nodes/${leaf.node.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { content: 'edited leaf' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ node: NodeBody }>().node.content).toBe('edited leaf')
    await app.close()
  })

  it('returns a cascade preview for a protected node, then applies with confirm', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const root = await createNodeReq(app, cookie, 'kl', { parentId: null, label: 'identity', content: 'orig' })
    await createNodeReq(app, cookie, 'kl', { parentId: root.node.id, label: 'c', content: 'child' })

    const preview = await app.inject({
      method: 'PATCH',
      url: `/api/trees/kl/nodes/${root.node.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { content: 'new core' },
    })
    expect(preview.statusCode).toBe(200)
    const previewBody = preview.json<{ requiresConfirmation?: boolean; affected?: unknown[] }>()
    expect(previewBody.requiresConfirmation).toBe(true)
    expect(Array.isArray(previewBody.affected)).toBe(true)

    const confirmed = await app.inject({
      method: 'PATCH',
      url: `/api/trees/kl/nodes/${root.node.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { content: 'new core', confirm: true },
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json<{ node: NodeBody }>().node.content).toBe('new core')
    await app.close()
  })
})

describe('move + delete', () => {
  it('moves a soft leaf under a new parent', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const root = await createNodeReq(app, cookie, 'kl', { parentId: null, label: 'r', content: 'root' })
    const branch = await createNodeReq(app, cookie, 'kl', { parentId: root.node.id, label: 'b', content: 'branch' })
    const leaf = await createNodeReq(app, cookie, 'kl', { parentId: branch.node.id, label: 'l', content: 'leaf' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/trees/kl/nodes/${leaf.node.id}/move`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { newParentId: root.node.id },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<NodeBody>().parentId).toBe(root.node.id)
    await app.close()
  })

  it('previews then deletes a node with descendants', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const root = await createNodeReq(app, cookie, 'kl', { parentId: null, label: 'r', content: 'root' })
    const branch = await createNodeReq(app, cookie, 'kl', { parentId: root.node.id, label: 'b', content: 'branch' })
    await createNodeReq(app, cookie, 'kl', { parentId: branch.node.id, label: 'l', content: 'leaf' })

    const preview = await app.inject({
      method: 'DELETE',
      url: `/api/trees/kl/nodes/${branch.node.id}`,
      headers: { cookie },
    })
    expect(preview.json<{ requiresConfirmation?: boolean }>().requiresConfirmation).toBe(true)

    const done = await app.inject({
      method: 'DELETE',
      url: `/api/trees/kl/nodes/${branch.node.id}?confirm=true`,
      headers: { cookie },
    })
    expect(done.statusCode).toBe(200)
    expect(done.json<{ deleted: string[] }>().deleted.length).toBe(2)
    await app.close()
  })
})

describe('DELETE /api/trees/:treeId', () => {
  it('previews without confirm, deletes with confirm', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    await createNodeReq(app, cookie, 'kl', { parentId: null, label: 'r', content: 'root' })

    const preview = await app.inject({ method: 'DELETE', url: '/api/trees/kl', headers: { cookie } })
    const pb = preview.json<{ requiresConfirmation?: boolean; nodeCount?: number }>()
    expect(pb.requiresConfirmation).toBe(true)
    expect(pb.nodeCount).toBe(1)

    const done = await app.inject({ method: 'DELETE', url: '/api/trees/kl?confirm=true', headers: { cookie } })
    expect(done.json<{ removed: number }>().removed).toBe(1)

    const after = await app.inject({ method: 'GET', url: '/api/trees', headers: { cookie } })
    expect(after.json()).toEqual([])
    await app.close()
  })
})

describe('write isolation', () => {
  it('user B cannot edit user A node and A is unchanged', async () => {
    const app = buildApp()
    await app.ready()
    const cookieA = await loginAs(app, getUserA())
    const a = await createNodeReq(app, cookieA, 'kl', { parentId: null, label: 'a', content: 'a-original' })

    const cookieB = await loginAs(app, getUserB())
    const attempt = await app.inject({
      method: 'PATCH',
      url: `/api/trees/kl/nodes/${a.node.id}`,
      headers: { cookie: cookieB, 'content-type': 'application/json' },
      payload: { content: 'hijacked', confirm: true },
    })
    expect(attempt.statusCode).toBe(404)

    const after = await app.inject({ method: 'GET', url: '/api/trees/kl', headers: { cookie: cookieA } })
    const forest = after.json<{ content: string }[]>()
    expect(forest[0]!.content).toBe('a-original')
    await app.close()
  })
})

describe('workflows', () => {
  it('defines, lists, runs and deletes a workflow', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())

    // a protected root so {{truths}} has something to render
    await createNodeReq(app, cookie, 'kl', {
      parentId: null,
      label: 'identity',
      content: 'the core truth',
    })

    const defined = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/workflows',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        name: 'plan_post',
        description: 'plan an on-brand post',
        template: 'Truths:\n{{truths}}\n\nPlan: {{input}}',
      },
    })
    expect(defined.statusCode).toBe(200)
    expect(defined.json<{ name: string }>().name).toBe('plan_post')

    const listed = await app.inject({
      method: 'GET',
      url: '/api/trees/kl/workflows',
      headers: { cookie },
    })
    expect(listed.json<{ name: string }[]>().map((w) => w.name)).toEqual(['plan_post'])

    const ran = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/workflows/plan_post/run',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { input: 'the launch' },
    })
    expect(ran.statusCode).toBe(200)
    const text = ran.json<{ text: string }>().text
    expect(text).toContain('the core truth')
    expect(text).toContain('the launch')

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/trees/kl/workflows/plan_post',
      headers: { cookie },
    })
    expect(deleted.statusCode).toBe(200)
    const afterList = await app.inject({
      method: 'GET',
      url: '/api/trees/kl/workflows',
      headers: { cookie },
    })
    expect(afterList.json()).toEqual([])
    await app.close()
  })

  it('rejects an invalid workflow name', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/workflows',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Bad Name', description: '', template: 'x' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns 404 running a missing workflow', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({
      method: 'POST',
      url: '/api/trees/kl/workflows/nope/run',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {},
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('does not show another user workflows (isolation)', async () => {
    const app = buildApp()
    await app.ready()
    const cookieB = await loginAs(app, getUserB())
    await app.inject({
      method: 'POST',
      url: '/api/trees/kl/workflows',
      headers: { cookie: cookieB, 'content-type': 'application/json' },
      payload: { name: 'secret', description: '', template: 'x' },
    })
    const cookieA = await loginAs(app, getUserA())
    const res = await app.inject({
      method: 'GET',
      url: '/api/trees/kl/workflows',
      headers: { cookie: cookieA },
    })
    expect(res.json()).toEqual([])
    await app.close()
  })
})
