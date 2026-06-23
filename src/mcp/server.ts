import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { TreeRepository } from '../core/repository.js'
import { getResolvedTree, getResolvedSubtree, getProtectedNodes, listTreeSummaries, deleteTree, searchTruths } from '../core/service.js'
import { createNode } from '../core/create.js'
import { updateNode, moveNode, deleteNode } from '../core/write.js'
import { registerWorkflows } from './workflows.js'
import type { WorkflowRepository } from '../core/workflow-repository.js'
import { defineWorkflow, runWorkflow } from '../core/workflow.js'

export interface McpDeps {
  repo: TreeRepository
  workflows: WorkflowRepository
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
        'Return the protected core of a tree: every node flagged protected (high hardness). Load these first and treat them as authoritative. Do not contradict a protected truth without explicit human confirmation.',
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
        'Return the full truth tree for a project as a list of roots (a tree may have several). Every node carries its content, server-computed effectiveHardness (0-100), and a protected flag. depthFromRoot is the structural level; hardness is a separate number, not the level.',
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
      description: [
        'Add a truth to a tree. Set parentId to an existing node id to nest it, or null to start a new root; several roots are allowed.',
        'label is a short title for the truth (e.g. "voice", "pricing-model"). content is the single truth itself, written as a durable statement.',
        'Hardness is decided by the server from the node position: a proposed hardnessSet is only a hint.',
        'The server clamps it into the structurally allowed band and may RAISE it to a floor (roots are always hard) or LOWER it to a ceiling (a shallow leaf cannot be softer than its load demands).',
        'hardnessSet is never taken at face value. When it is clamped, the response includes a hardnessNote explaining what happened.',
        'Structure guidance: add only DURABLE truths. If the content would be wrong in a few months (a price, a metric, a percentage, a current number), it belongs in a decision-record document, not in the tree. One node is one truth. Keep sibling nodes at a similar level of detail. Give a distinct theme its own root instead of overloading an unrelated parent.',
      ].join(' '),
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

  server.registerTool(
    'update_node',
    {
      description:
        "Edit a node's content, label or proposed hardness. If the node is protected, this returns a cascade preview (what hangs on it) instead of changing it; show it to the human and re-run with confirm: true after they approve. A proposed hardnessSet is only a hint: the server may raise it to a floor or lower it to a ceiling based on the node's structural position. When clamped, the response includes a hardnessNote.",
      inputSchema: {
        treeId: z.string(),
        nodeId: z.string(),
        content: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
        hardnessSet: z.number().min(0).max(100).nullable().optional(),
        confirm: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        return ok(
          await updateNode(
            deps.repo,
            {
              treeId: args.treeId,
              nodeId: args.nodeId,
              content: args.content,
              label: args.label,
              hardnessSet: args.hardnessSet,
              confirm: args.confirm,
            },
            now(),
          ),
        )
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'move_node',
    {
      description:
        'Re-hang a node under a new parent (newParentId), or null to make it its own root. Rejects cycles. A protected node returns a cascade preview unless confirm: true.',
      inputSchema: {
        treeId: z.string(),
        nodeId: z.string(),
        newParentId: z.string().nullable(),
        confirm: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        return ok(
          await moveNode(
            deps.repo,
            { treeId: args.treeId, nodeId: args.nodeId, newParentId: args.newParentId, confirm: args.confirm },
            now(),
          ),
        )
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'delete_node',
    {
      description:
        'Delete a node and its descendants. Returns a cascade preview (what would be removed) unless confirm: true. Confirmation is required if the node is protected or has descendants.',
      inputSchema: {
        treeId: z.string(),
        nodeId: z.string(),
        confirm: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        return ok(
          await deleteNode(
            deps.repo,
            { treeId: args.treeId, nodeId: args.nodeId, confirm: args.confirm },
            now(),
          ),
        )
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'list_trees',
    {
      description:
        'List your trees and how many truths each holds. Use this first when you do not know which treeId to read.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await listTreeSummaries(deps.repo))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'delete_tree',
    {
      description:
        'Delete an entire tree and all its truths. This is irreversible. Without confirm: true the tool returns a preview showing how many nodes would be removed. Pass confirm: true only after the user has approved.',
      inputSchema: {
        treeId: z.string(),
        confirm: z.boolean().optional(),
      },
    },
    async ({ treeId, confirm }) => {
      try {
        if (!confirm) {
          const summaries = await listTreeSummaries(deps.repo)
          const summary = summaries.find((s) => s.treeId === treeId)
          const nodeCount = summary?.nodeCount ?? 0
          return ok({ requiresConfirmation: true, treeId, nodeCount })
        }
        const removed = await deleteTree(deps.repo, treeId)
        return ok({ deleted: treeId, removed })
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'search_truths',
    {
      description:
        'Find truths in a tree by keyword, for when the tree is too big to read whole. Returns matching nodes with their server-computed effectiveHardness and protected flag, the same shape as get_tree nodes.',
      inputSchema: {
        treeId: z.string(),
        query: z.string().min(1),
      },
    },
    async ({ treeId, query }) => {
      try {
        return ok(await searchTruths(deps.repo, treeId, query, now()))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'define_workflow',
    {
      description:
        'Create or update a reusable workflow for a tree. The template is text with {{truths}} (filled with the protected core) and {{input}} (filled by the caller) placeholders. Workflows are how you adapt Heartwood to your own use case, whatever it is.',
      inputSchema: {
        treeId: z.string(),
        name: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters, digits, - and _'),
        description: z.string(),
        template: z.string().min(1),
      },
    },
    async (args) => {
      try {
        return ok(await defineWorkflow(deps.workflows, args, now()))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'list_workflows',
    {
      description: 'List the workflows defined for a tree.',
      inputSchema: { treeId: z.string() },
    },
    async ({ treeId }) => {
      try {
        return ok(await deps.workflows.listWorkflows(treeId))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'delete_workflow',
    {
      description: 'Delete a workflow from a tree.',
      inputSchema: { treeId: z.string(), name: z.string() },
    },
    async ({ treeId, name }) => {
      try {
        await deps.workflows.deleteWorkflow(treeId, name)
        return ok({ deleted: name })
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'run_workflow',
    {
      description:
        'Run a defined workflow: loads the protected truths and fills the template, returning ready-to-use text. Also available as the /run_workflow prompt.',
      inputSchema: { treeId: z.string(), name: z.string(), input: z.string().optional() },
    },
    async (args) => {
      try {
        return ok({ text: await runWorkflow(deps.repo, deps.workflows, args, now()) })
      } catch (error) {
        return fail(error)
      }
    },
  )

  registerWorkflows(server, deps)

  return server
}
