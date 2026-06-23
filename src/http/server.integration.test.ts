import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { buildServer } from './server.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { PostgresWorkflowStore } from '../storage/postgres-workflows.js'
import { generateToken } from '../auth/tokens.js'
import { apiTokens } from '../storage/schema.js'
import { setupPostgresTests, getDb, getUserA, getUserB } from '../storage/postgres-test-setup.js'

const fixedNow = (): Date => new Date('2026-01-01T00:00:00.000Z')
const SESSION_SECRET = 'test-session-secret-at-least-32-chars-long'

setupPostgresTests()

let running: FastifyInstance | undefined
let tokenA = ''
let tokenB = ''

/** Seeds an api_tokens row for a user and returns the raw bearer token. */
const seedToken = async (userId: string, name: string): Promise<string> => {
  const { raw, hash, prefix } = generateToken()
  await getDb().insert(apiTokens).values({ userId, name, tokenHash: hash, prefix })
  return raw
}

const startServer = async (): Promise<URL> => {
  const db = getDb()
  const app = buildServer({
    db,
    treeStore: new PostgresTreeStore(db),
    workflowStore: new PostgresWorkflowStore(db),
    now: fixedNow,
    sessionSecret: SESSION_SECRET,
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  running = app
  const address = app.server.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
  return new URL(`http://127.0.0.1:${address.port}/mcp`)
}

const connect = async (url: URL, token: string): Promise<Client> => {
  const client = new Client({ name: 'integration-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  return client
}

const ToolResult = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
})
const NodeView = z.object({
  id: z.string(),
  label: z.string(),
  effectiveHardness: z.number(),
  protected: z.boolean(),
})

const textOf = (result: unknown): string => {
  const first = ToolResult.parse(result).content[0]
  if (!first || first.type !== 'text' || first.text === undefined) throw new Error('expected text content')
  return first.text
}
const parseOne = (result: unknown): z.infer<typeof NodeView> => NodeView.parse(JSON.parse(textOf(result)))
const parseForest = (result: unknown): z.infer<typeof NodeView>[] =>
  z.array(NodeView).parse(JSON.parse(textOf(result)))

beforeEach(async () => {
  // postgres-test-setup truncates + reseeds users before each test; mint fresh tokens.
  tokenA = await seedToken(getUserA(), 'token-a')
  tokenB = await seedToken(getUserB(), 'token-b')
})

afterEach(async () => {
  const app = running
  running = undefined
  if (app) await app.close()
})

describe('http + mcp end to end', () => {
  it('rejects a connection with a wrong token', async () => {
    const url = await startServer()
    await expect(connect(url, 'hw_definitely-not-a-real-token')).rejects.toThrow()
  })

  it('rejects a connection with no token', async () => {
    const url = await startServer()
    const client = new Client({ name: 'integration-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(url)
    await expect(client.connect(transport)).rejects.toThrow()
  })

  it('accepts a valid token and lists its tools', async () => {
    const url = await startServer()
    const client = await connect(url, tokenA)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_node',
      'define_workflow',
      'delete_node',
      'delete_workflow',
      'get_roots',
      'get_subtree',
      'get_tree',
      'list_workflows',
      'move_node',
      'run_workflow',
      'update_node',
    ])
    await client.close()
  })

  it('creates a root via create_node and reads it back via get_tree', async () => {
    const url = await startServer()
    const client = await connect(url, tokenA)
    const created = parseOne(
      await client.callTool({
        name: 'create_node',
        arguments: { treeId: 'keeperlog', parentId: null, label: 'identity', content: 'portable animal record' },
      }),
    )
    expect(created.protected).toBe(true)

    const forest = parseForest(await client.callTool({ name: 'get_tree', arguments: { treeId: 'keeperlog' } }))
    expect(forest).toHaveLength(1)
    expect(forest[0]?.label).toBe('identity')
    await client.close()
  })

  it('clamps a proposed hardness on a deep leaf created via the tool (the QR case)', async () => {
    const url = await startServer()
    const client = await connect(url, tokenA)
    let parentId: string | null = null
    for (const label of ['root', 'a', 'b', 'c', 'd']) {
      const created = parseOne(
        await client.callTool({ name: 'create_node', arguments: { treeId: 't', parentId, label, content: 'x' } }),
      )
      parentId = created.id
    }
    const leaf = parseOne(
      await client.callTool({
        name: 'create_node',
        arguments: { treeId: 't', parentId, label: 'qr', content: 'qr', hardnessSet: 100 },
      }),
    )
    expect(leaf.protected).toBe(false)
    await client.close()
  })

  it('gates an edit of a protected node behind confirm', async () => {
    const url = await startServer()
    const client = await connect(url, tokenA)
    const root = parseOne(
      await client.callTool({
        name: 'create_node',
        arguments: { treeId: 'g', parentId: null, label: 'identity', content: 'original' },
      }),
    )

    const previewRaw = JSON.parse(
      textOf(await client.callTool({ name: 'update_node', arguments: { treeId: 'g', nodeId: root.id, content: 'hijacked' } })),
    )
    expect(z.object({ requiresConfirmation: z.literal(true) }).parse(previewRaw).requiresConfirmation).toBe(true)

    const updated = parseOne(
      await client.callTool({
        name: 'update_node',
        arguments: { treeId: 'g', nodeId: root.id, content: 'on purpose', confirm: true },
      }),
    )
    expect(updated.id).toBe(root.id)
    await client.close()
  })

  it('serves the protected core over REST for the hook, bearer-gated', async () => {
    const url = await startServer()
    const base = `${url.protocol}//${url.host}`
    const client = await connect(url, tokenA)
    await client.callTool({
      name: 'create_node',
      arguments: { treeId: 'h', parentId: null, label: 'identity', content: 'x' },
    })
    await client.close()

    const res = await fetch(`${base}/trees/h/roots`, { headers: { authorization: `Bearer ${tokenA}` } })
    expect(res.status).toBe(200)
    const nodes = z.array(NodeView).parse(await res.json())
    expect(nodes.some((n) => n.label === 'identity')).toBe(true)

    const noauth = await fetch(`${base}/trees/h/roots`)
    expect(noauth.status).toBe(401)
  })

  it('scopes the roots endpoint to the authenticated user', async () => {
    const url = await startServer()
    const base = `${url.protocol}//${url.host}`

    // userA seeds a tree "shared" with their own identity node.
    const clientA = await connect(url, tokenA)
    await clientA.callTool({
      name: 'create_node',
      arguments: { treeId: 'shared', parentId: null, label: 'identity-a', content: 'a' },
    })
    await clientA.close()

    // userB seeds a same-named tree with a different node.
    const clientB = await connect(url, tokenB)
    await clientB.callTool({
      name: 'create_node',
      arguments: { treeId: 'shared', parentId: null, label: 'identity-b', content: 'b' },
    })
    await clientB.close()

    const resA = await fetch(`${base}/trees/shared/roots`, { headers: { authorization: `Bearer ${tokenA}` } })
    const nodesA = z.array(NodeView).parse(await resA.json())
    expect(nodesA.map((n) => n.label)).toEqual(['identity-a'])

    const resB = await fetch(`${base}/trees/shared/roots`, { headers: { authorization: `Bearer ${tokenB}` } })
    const nodesB = z.array(NodeView).parse(await resB.json())
    expect(nodesB.map((n) => n.label)).toEqual(['identity-b'])
  })

  it('exposes the workflow prompts and loads truths into them', async () => {
    const url = await startServer()
    const client = await connect(url, tokenA)
    await client.callTool({
      name: 'create_node',
      arguments: { treeId: 'w', parentId: null, label: 'identity', content: 'the one truth' },
    })

    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name).sort()).toEqual(['build_guide', 'check_consistency', 'run_workflow'])

    const built = await client.getPrompt({ name: 'build_guide', arguments: { treeId: 'w' } })
    const text = built.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).join('\n')
    expect(text).toContain('the one truth')
    await client.close()
  })

  it('defines a custom workflow and runs it with truths filled in', async () => {
    const url = await startServer()
    const client = await connect(url, tokenA)
    await client.callTool({
      name: 'create_node',
      arguments: { treeId: 'c', parentId: null, label: 'identity', content: 'a person who values calm' },
    })
    await client.callTool({
      name: 'define_workflow',
      arguments: {
        treeId: 'c',
        name: 'draft_message',
        description: 'draft an on-voice message',
        template: 'Voice truths:\n{{truths}}\n\nDraft a message about: {{input}}',
      },
    })
    const ran = JSON.parse(
      textOf(
        await client.callTool({
          name: 'run_workflow',
          arguments: { treeId: 'c', name: 'draft_message', input: 'a delay' },
        }),
      ),
    )
    const out = z.object({ text: z.string() }).parse(ran).text
    expect(out).toContain('a person who values calm')
    expect(out).toContain('a delay')
    await client.close()
  })
})
