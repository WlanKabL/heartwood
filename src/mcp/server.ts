import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { TreeRepository } from '../core/repository.js'
import { getResolvedTree, getResolvedSubtree, getProtectedNodes } from '../core/service.js'
import { createNode } from '../core/create.js'

export interface McpDeps {
  repo: TreeRepository
  now: () => Date
}

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
})

const fail = (error: unknown) => ({
  content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
  isError: true,
})

/**
 * Thin MCP facade over the core. Each tool delegates to a service use-case and returns
 * JSON. No business logic lives here; the server decides hardness, not the adapter.
 */
export const buildMcpServer = (deps: McpDeps): McpServer => {
  const server = new McpServer({ name: 'heartwood', version: '0.1.0' })
  const now = (): Date => deps.now()

  server.registerTool(
    'get_roots',
    {
      description:
        'Return the protected core of a tree: the truths at or above the protection threshold. Load these first and treat them as authoritative. Do not contradict a high-hardness truth without explicit human confirmation.',
      inputSchema: { treeId: z.string() },
    },
    async ({ treeId }) => {
      try {
        return ok(await getProtectedNodes(deps.repo, treeId, now()))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'get_tree',
    {
      description:
        'Return the full truth tree for a project. Every node carries its content, server-computed effectiveHardness and band (leaf, branch, trunk, root).',
      inputSchema: { treeId: z.string() },
    },
    async ({ treeId }) => {
      try {
        return ok(await getResolvedTree(deps.repo, treeId, now()))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'get_subtree',
    {
      description: 'Return a node and its descendants by node id.',
      inputSchema: { treeId: z.string(), nodeId: z.string() },
    },
    async ({ treeId, nodeId }) => {
      try {
        return ok(await getResolvedSubtree(deps.repo, treeId, nodeId, now()))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'create_node',
    {
      description:
        'Add a truth to a tree under a parent, or as the root with parentId null. Hardness is decided by the server from the node position; a proposed hardnessSet is clamped into the structurally allowed band and can never exceed it.',
      inputSchema: {
        treeId: z.string(),
        parentId: z.string().nullable(),
        label: z.string().min(1),
        content: z.string().min(1),
        hardnessSet: z.number().min(0).max(100).nullable().optional(),
      },
    },
    async (args) => {
      try {
        return ok(
          await createNode(
            deps.repo,
            {
              treeId: args.treeId,
              parentId: args.parentId,
              label: args.label,
              content: args.content,
              hardnessSet: args.hardnessSet ?? null,
            },
            now(),
          ),
        )
      } catch (error) {
        return fail(error)
      }
    },
  )

  return server
}
