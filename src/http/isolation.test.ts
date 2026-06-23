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

/**
 * The security gate of the multi-tenant rebuild. Every read and every write goes through
 * the real HTTP/MCP boundary, authed by a bearer token that resolves to a userId. Two
 * tenants share the same treeId on purpose; the assertions prove that B can neither see
 * nor mutate A's data, and that A's data is provably unchanged after B's attempts.
 *
 * Mirrors the setup of server.integration.test.ts so isolation is tested with the exact
 * machinery the app ships with, not a stripped-down stub.
 */

const fixedNow = (): Date => new Date('2026-01-01T00:00:00.000Z')
const SESSION_SECRET = 'test-session-secret-at-least-32-chars-long'
const SHARED_TREE = 'keeperlog'

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
    github: { clientId: 'dummy-client-id', clientSecret: 'dummy-client-secret' },
    publicUrl: 'http://localhost:8722',
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  running = app
  const address = app.server.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
  return new URL(`http://127.0.0.1:${address.port}/mcp`)
}

const connect = async (url: URL, token: string): Promise<Client> => {
  const client = new Client({ name: 'isolation-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  return client
}

const ToolResult = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  isError: z.boolean().optional(),
})
const NodeView = z.object({
  id: z.string(),
  label: z.string(),
  content: z.string(),
  effectiveHardness: z.number(),
  protected: z.boolean(),
})

const textOf = (result: unknown): string => {
  const first = ToolResult.parse(result).content[0]
  if (!first || first.type !== 'text' || first.text === undefined) throw new Error('expected text content')
  return first.text
}
const isErrorResult = (result: unknown): boolean => ToolResult.parse(result).isError === true
const parseOne = (result: unknown): z.infer<typeof NodeView> => NodeView.parse(JSON.parse(textOf(result)))
const parseForest = (result: unknown): z.infer<typeof NodeView>[] =>
  z.array(NodeView).parse(JSON.parse(textOf(result)))

/** Re-reads A's node via get_subtree as A and returns its current view. */
const readNodeAsA = async (url: URL, nodeId: string): Promise<z.infer<typeof NodeView>> => {
  const clientA = await connect(url, tokenA)
  const node = parseOne(
    await clientA.callTool({ name: 'get_subtree', arguments: { treeId: SHARED_TREE, nodeId } }),
  )
  await clientA.close()
  return node
}

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

describe('cross-tenant isolation at the HTTP/MCP boundary', () => {
  it('B cannot read A nodes via get_tree, get_roots or get_subtree', async () => {
    const url = await startServer()

    // A builds a tree with a root and a nested child.
    const clientA = await connect(url, tokenA)
    const aRoot = parseOne(
      await clientA.callTool({
        name: 'create_node',
        arguments: { treeId: SHARED_TREE, parentId: null, label: 'identity-a', content: 'a-secret-root' },
      }),
    )
    const aChild = parseOne(
      await clientA.callTool({
        name: 'create_node',
        arguments: { treeId: SHARED_TREE, parentId: aRoot.id, label: 'detail-a', content: 'a-secret-child' },
      }),
    )
    await clientA.close()

    const clientB = await connect(url, tokenB)

    // get_tree: B sees an empty forest under the same treeId.
    const bForest = parseForest(
      await clientB.callTool({ name: 'get_tree', arguments: { treeId: SHARED_TREE } }),
    )
    expect(bForest).toEqual([])

    // get_roots: B sees no protected core.
    const bRoots = parseForest(
      await clientB.callTool({ name: 'get_roots', arguments: { treeId: SHARED_TREE } }),
    )
    expect(bRoots).toEqual([])

    // get_subtree on A's exact node ids: B cannot resolve them, and the result carries
    // no A content. It is an error result, never a leak of A's node.
    const bSubtreeRoot = await clientB.callTool({
      name: 'get_subtree',
      arguments: { treeId: SHARED_TREE, nodeId: aRoot.id },
    })
    expect(isErrorResult(bSubtreeRoot)).toBe(true)
    expect(textOf(bSubtreeRoot)).not.toContain('a-secret-root')

    const bSubtreeChild = await clientB.callTool({
      name: 'get_subtree',
      arguments: { treeId: SHARED_TREE, nodeId: aChild.id },
    })
    expect(isErrorResult(bSubtreeChild)).toBe(true)
    expect(textOf(bSubtreeChild)).not.toContain('a-secret-child')

    await clientB.close()
  })

  it('B cannot update A node; the attempt fails and A node is unchanged', async () => {
    const url = await startServer()

    const clientA = await connect(url, tokenA)
    const aNode = parseOne(
      await clientA.callTool({
        name: 'create_node',
        arguments: { treeId: SHARED_TREE, parentId: null, label: 'identity-a', content: 'original-a' },
      }),
    )
    await clientA.close()

    // B targets A's node id (with confirm, to rule out the cascade-preview branch).
    const clientB = await connect(url, tokenB)
    const attempt = await clientB.callTool({
      name: 'update_node',
      arguments: { treeId: SHARED_TREE, nodeId: aNode.id, content: 'hijacked-by-b', confirm: true },
    })
    await clientB.close()

    expect(isErrorResult(attempt)).toBe(true)
    expect(textOf(attempt)).toMatch(/not found|unknown/i)
    expect(textOf(attempt)).not.toContain('original-a')

    // Read-back as A: the node still holds A's original content.
    const after = await readNodeAsA(url, aNode.id)
    expect(after.content).toBe('original-a')
    expect(after.label).toBe('identity-a')
  })

  it('B cannot delete A node; the attempt fails and A node survives', async () => {
    const url = await startServer()

    const clientA = await connect(url, tokenA)
    const aNode = parseOne(
      await clientA.callTool({
        name: 'create_node',
        arguments: { treeId: SHARED_TREE, parentId: null, label: 'identity-a', content: 'survivor-a' },
      }),
    )
    await clientA.close()

    const clientB = await connect(url, tokenB)
    const attempt = await clientB.callTool({
      name: 'delete_node',
      arguments: { treeId: SHARED_TREE, nodeId: aNode.id, confirm: true },
    })
    await clientB.close()

    expect(isErrorResult(attempt)).toBe(true)
    expect(textOf(attempt)).toMatch(/not found|unknown/i)

    // Read-back as A: the node is still there, untouched.
    const after = await readNodeAsA(url, aNode.id)
    expect(after.id).toBe(aNode.id)
    expect(after.content).toBe('survivor-a')
  })

  it('B cannot move A node; the attempt fails and A node keeps its place', async () => {
    const url = await startServer()

    // A has two roots so a "move under the other root" is structurally meaningful.
    const clientA = await connect(url, tokenA)
    const aRoot1 = parseOne(
      await clientA.callTool({
        name: 'create_node',
        arguments: { treeId: SHARED_TREE, parentId: null, label: 'root-1-a', content: 'root-one' },
      }),
    )
    const aRoot2 = parseOne(
      await clientA.callTool({
        name: 'create_node',
        arguments: { treeId: SHARED_TREE, parentId: null, label: 'root-2-a', content: 'root-two' },
      }),
    )
    await clientA.close()

    // B tries to re-hang A's root-1 under A's root-2.
    const clientB = await connect(url, tokenB)
    const attempt = await clientB.callTool({
      name: 'move_node',
      arguments: { treeId: SHARED_TREE, nodeId: aRoot1.id, newParentId: aRoot2.id, confirm: true },
    })
    await clientB.close()

    expect(isErrorResult(attempt)).toBe(true)
    expect(textOf(attempt)).toMatch(/not found|unknown/i)

    // Read-back as A: root-1 is still a root (parentId null), not nested under root-2.
    const after = await readNodeAsA(url, aRoot1.id)
    expect(after.id).toBe(aRoot1.id)
    // get_subtree of root-2 must not contain root-1 as a descendant.
    const clientA2 = await connect(url, tokenA)
    const root2View = JSON.parse(
      textOf(await clientA2.callTool({ name: 'get_subtree', arguments: { treeId: SHARED_TREE, nodeId: aRoot2.id } })),
    )
    await clientA2.close()
    expect(JSON.stringify(root2View)).not.toContain(aRoot1.id)
  })

  it('the roots REST endpoint returns only the caller’s own data', async () => {
    const url = await startServer()
    const base = `${url.protocol}//${url.host}`

    // A seeds a node; B seeds a same-named tree with their own node.
    const clientA = await connect(url, tokenA)
    await clientA.callTool({
      name: 'create_node',
      arguments: { treeId: SHARED_TREE, parentId: null, label: 'identity-a', content: 'a-only' },
    })
    await clientA.close()

    const clientB = await connect(url, tokenB)
    await clientB.callTool({
      name: 'create_node',
      arguments: { treeId: SHARED_TREE, parentId: null, label: 'identity-b', content: 'b-only' },
    })
    await clientB.close()

    const resA = await fetch(`${base}/trees/${SHARED_TREE}/roots`, {
      headers: { authorization: `Bearer ${tokenA}` },
    })
    expect(resA.status).toBe(200)
    const nodesA = z.array(NodeView).parse(await resA.json())
    expect(nodesA.map((n) => n.label)).toEqual(['identity-a'])
    expect(JSON.stringify(nodesA)).not.toContain('b-only')

    const resB = await fetch(`${base}/trees/${SHARED_TREE}/roots`, {
      headers: { authorization: `Bearer ${tokenB}` },
    })
    expect(resB.status).toBe(200)
    const nodesB = z.array(NodeView).parse(await resB.json())
    expect(nodesB.map((n) => n.label)).toEqual(['identity-b'])
    expect(JSON.stringify(nodesB)).not.toContain('a-only')
  })
})
