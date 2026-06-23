import { describe, it, expect, afterEach } from 'vitest'
import type { Server } from 'node:http'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTreeRepository } from '../core/repository.js'
import { createHttpServer } from './server.js'

const TOKEN = 'test-token'
const fixedNow = (): Date => new Date('2026-01-01T00:00:00.000Z')

let running: Server | undefined

const startServer = async (): Promise<URL> => {
  const repo = new InMemoryTreeRepository()
  const server = createHttpServer({ token: TOKEN, deps: { repo, now: fixedNow } })
  await new Promise<void>((resolve) => server.listen(0, () => resolve()))
  running = server
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
  return new URL(`http://localhost:${address.port}/mcp`)
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
const NodeView = z.object({ id: z.string(), label: z.string(), band: z.string() })

const parseNode = (result: unknown): z.infer<typeof NodeView> => {
  const first = ToolResult.parse(result).content[0]
  if (!first || first.type !== 'text' || first.text === undefined) throw new Error('expected text content')
  return NodeView.parse(JSON.parse(first.text))
}

afterEach(async () => {
  const server = running
  running = undefined
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('http + mcp end to end', () => {
  it('rejects a connection with a wrong token', async () => {
    const url = await startServer()
    await expect(connect(url, 'wrong-token')).rejects.toThrow()
  })

  it('accepts a valid token and lists the four tools', async () => {
    const url = await startServer()
    const client = await connect(url, TOKEN)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['create_node', 'get_roots', 'get_subtree', 'get_tree'])
    await client.close()
  })

  it('creates the root via create_node and reads it back via get_tree', async () => {
    const url = await startServer()
    const client = await connect(url, TOKEN)
    const created = parseNode(
      await client.callTool({
        name: 'create_node',
        arguments: { treeId: 'keeperlog', parentId: null, label: 'identity', content: 'portable animal record' },
      }),
    )
    expect(created.band).toBe('root')

    const tree = parseNode(await client.callTool({ name: 'get_tree', arguments: { treeId: 'keeperlog' } }))
    expect(tree.label).toBe('identity')
    expect(tree.band).toBe('root')
    await client.close()
  })

  it('clamps a proposed hardness on a deep leaf created via the tool (the QR case)', async () => {
    const url = await startServer()
    const client = await connect(url, TOKEN)
    let parentId: string | null = null
    for (const label of ['root', 'a', 'b', 'c', 'd']) {
      const created = parseNode(
        await client.callTool({ name: 'create_node', arguments: { treeId: 't', parentId, label, content: 'x' } }),
      )
      parentId = created.id
    }
    const leaf = parseNode(
      await client.callTool({
        name: 'create_node',
        arguments: { treeId: 't', parentId, label: 'qr', content: 'qr', hardnessSet: 100 },
      }),
    )
    expect(leaf.band).toBe('leaf')
    await client.close()
  })
})
