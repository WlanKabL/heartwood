import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpDeps } from './server.js'
import { getProtectedNodes } from '../core/service.js'
import { formatTruths, runWorkflow } from '../core/workflow.js'

/**
 * Workflows are MCP prompts (slash-commands in Claude Code). Two generic defaults plus a
 * universal runner for the workflows you define yourself with define_workflow. A workflow
 * is content-agnostic: it loads the project's truths and lays out a procedure, whether the
 * project is a brand, a person, a company or anything else.
 */

const userMessage = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
})

export const registerWorkflows = (server: McpServer, deps: McpDeps): void => {
  const truthsFor = async (treeId: string): Promise<string> =>
    formatTruths(await getProtectedNodes(deps.repo, treeId, deps.now()))

  server.registerPrompt(
    'build_guide',
    {
      title: 'Heartwood: how to build a coherent tree',
      description: 'Guidance for authoring or extending a truth tree well, for any kind of project.',
      argsSchema: { treeId: z.string() },
    },
    async ({ treeId }) =>
      userMessage(
        [
          `You are authoring the Heartwood truth tree for "${treeId}". A tree holds the stable truths about anything: a brand, a person, a company, a project.`,
          '',
          'Rules for a coherent tree:',
          '- One node is one truth. Do not pack several claims into one node.',
          '- Roots are the few things that almost never change. A tree may have several roots; give a distinct theme its own root rather than overloading another.',
          '- Keep sibling nodes at a similar level of detail.',
          '- Hardness comes from a node\'s position, not from a number you assert. Propose hardnessSet only as a hint.',
          '- Use create_node to add; update_node / move_node / delete_node to maintain. Protected nodes require confirm: true.',
          '',
          'Current protected core:',
          await truthsFor(treeId),
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'check_consistency',
    {
      title: 'Heartwood: check a draft against the project truths',
      description: 'Flag where a draft (copy, plan, message, decision) contradicts the protected truths.',
      argsSchema: { treeId: z.string(), draft: z.string() },
    },
    async ({ treeId, draft }) =>
      userMessage(
        [
          `Check the draft below against the protected truths of "${treeId}".`,
          'For each truth the draft touches, say whether the draft is consistent, and quote the conflict if not.',
          'Be strict: a protected truth is authoritative. End with a clear verdict: consistent, or a list of contradictions to fix.',
          '',
          'Project truths:',
          await truthsFor(treeId),
          '',
          'Draft:',
          draft,
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'run_workflow',
    {
      title: 'Heartwood: run a custom workflow',
      description: 'Run a workflow you defined with define_workflow. Loads the truths and fills your template.',
      argsSchema: { treeId: z.string(), name: z.string(), input: z.string().optional() },
    },
    async ({ treeId, name, input }) =>
      userMessage(await runWorkflow(deps.repo, deps.workflows, { treeId, name, input }, deps.now())),
  )
}
