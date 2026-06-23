import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpDeps } from './server.js'
import type { ResolvedNode } from '../core/types.js'
import { getProtectedNodes } from '../core/service.js'

/**
 * Workflows are MCP prompts: named, retrievable procedures (slash-commands in Claude
 * Code) that load the project's protected truths at call time and lay out the steps.
 * This is "a knowledge base that feeds workflows": the truths plus a standard procedure.
 * These three are defaults; they are meant to be adapted per project later.
 */

const formatTruths = (nodes: ResolvedNode[]): string =>
  nodes.length === 0
    ? '(no protected truths yet — build the tree first)'
    : nodes
        .slice()
        .sort((a, b) => b.effectiveHardness - a.effectiveHardness)
        .map((n) => `- ${n.label} (hardness ${Math.round(n.effectiveHardness)}): ${n.content}`)
        .join('\n')

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
      description: 'Guidance for authoring or extending a project truth tree well.',
      argsSchema: { treeId: z.string() },
    },
    async ({ treeId }) =>
      userMessage(
        [
          `You are authoring the Heartwood truth tree for "${treeId}".`,
          '',
          'Rules for a coherent tree:',
          '- One node is one truth. Do not pack several claims into one node.',
          '- Roots are the few things that almost never change. A tree may have several roots; give a distinct theme (identity, voice, positioning, product, audiences) its own root rather than overloading another.',
          '- Keep sibling nodes at a similar level of detail.',
          '- Hardness is decided by the server from position, not by a number you assert. Propose hardnessSet only as a hint.',
          '- Use create_node to add; update_node / move_node / delete_node to maintain. Protected nodes require confirm: true.',
          '',
          'Current protected core:',
          await truthsFor(treeId),
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'plan_feature',
    {
      title: 'Heartwood: plan a feature against the project truths',
      description: 'Work a feature through a Definition of Ready and Done, grounded in the tree.',
      argsSchema: { treeId: z.string(), feature: z.string() },
    },
    async ({ treeId, feature }) =>
      userMessage(
        [
          `Plan this feature for "${treeId}", grounded in the project truths below.`,
          '',
          `Feature: ${feature}`,
          '',
          'Project truths (authoritative; do not contradict):',
          await truthsFor(treeId),
          '',
          'Definition of Ready (answer each before building):',
          '1. Which truth does this serve, and does it contradict any protected truth?',
          "2. Who is it for, in the project's own audience terms?",
          '3. What is explicitly out of scope?',
          '4. What does done look like, observably?',
          '',
          'Definition of Done (close with):',
          '- Built end to end, tested.',
          '- Consistent with the voice and positioning truths.',
          '- Any durable new truth captured back into the tree via create_node.',
          '',
          'Produce a short spec that passes the Definition of Ready, then the build steps.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'check_consistency',
    {
      title: 'Heartwood: check a draft against the project truths',
      description: 'Flag where a draft (copy, plan, decision) contradicts the protected truths.',
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
}
