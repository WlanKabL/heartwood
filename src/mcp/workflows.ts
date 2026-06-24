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
    'init_tree',
    {
      title: 'Heartwood: initialise a project truth tree from scratch',
      description:
        'Start a new tree for a project that has none yet: pick the right treeId, understand the project, ask only as much as the gap demands, then build roots first. Use this the first time a project is captured in Heartwood.',
    },
    async () =>
      userMessage(
        [
          'You are initialising a Heartwood truth tree for a project that has none yet. Heartwood stores a project\'s durable truths as a hardened tree and serves them to AI agents across runtimes. Your job now is to set that tree up cleanly. Work the steps in order, and do not write a single node before step 5.',
          '',
          'STEP 1: See what already exists.',
          'Call list_trees. If a tree for this project already exists, you are not initialising, you are extending: stop and use the build_guide prompt instead. Continue here only if there is genuinely no tree for this project yet.',
          '',
          'STEP 2: Choose the treeId.',
          'The treeId is the project\'s real short name in kebab-case: "keeperlog", "zentrax", "heartwood". It is permanent and shared across every session, so it must be the actual project name, NEVER a placeholder like "my-project", "project", "default" or "test". If you cannot tell what the project is called, ask the human one short question before going further. A wrong or generic id is the single most common mistake here, so do not guess.',
          '',
          'STEP 3: Understand the project, then gauge how much you actually know.',
          'Read whatever durable sources exist before asking anything: a README, a CLAUDE.md or AGENTS.md, package.json, a docs/ or strategy folder, pinned identity or positioning notes. For a non-software project (a brand, a person, a social account, a company) there may be no repo at all; look at whatever the human points you to, or at the conversation so far.',
          '',
          'STEP 4: Ask exactly as many questions as the gap demands, no more, no less.',
          'The number of questions is not fixed. Let the gap set it:',
          '- If the project is already well described and you could write its roots correctly right now, ask nothing. Go straight to a proposed tree and let the human correct it.',
          '- If a few things are genuinely ambiguous, ask only those few targeted questions.',
          '- If little is clear, or this is a domain with no written source ("this is my cooking Instagram"), do not invent a whole identity. Give a two-line description of what Heartwood will store and why, then ask as many questions as it takes to get the roots right, in small batches rather than one wall of forty.',
          'The test for every truth is the same: do you know this well enough to write a statement the human would not immediately correct? If not, ask.',
          'Also ask the one fixed question before writing: "Should Heartwood be the single source of truth here, so I move the durable truths out of any existing file (an identity.md, a strategy doc) into the tree and leave that file as a short pointer to Heartwood? Or keep the files and only mirror the truths here?" Migrate or delete nothing until they answer.',
          '',
          'STEP 5: Build, roots first, with a nod before you commit.',
          'Propose the shape before creating it: a handful of roots for the distinct top-level themes, then the detail that hangs under each. Show the human the proposed roots, get a nod, then create them with create_node (parentId null) and nest details under the ids that came back. Keep volatile figures (prices, metrics, dates, current numbers) out of the tree entirely.',
          '',
          'When the roots are in place, run the build_guide prompt for the same treeId to keep authoring with the full rules and the live protected core in front of you.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'build_guide',
    {
      title: 'Heartwood: how to build a coherent tree',
      description:
        'Thorough guidance for authoring or extending a truth tree well, for any kind of project. Loads the current protected core.',
      argsSchema: { treeId: z.string() },
    },
    async ({ treeId }) =>
      userMessage(
        [
          `You are authoring the Heartwood truth tree for "${treeId}". A tree holds the stable truths about anything: a brand, a person, a company, a product, a project. The goal is a tree so clean that a future agent can load it cold and act correctly. Read these rules fully before writing, because a sloppy tree is worse than none: it is trusted.`,
          '',
          'THE MODEL',
          'A tree is a small forest of roots with detail nested underneath. Depth is one axis on which four things move together: the deeper a node sits, the more authoritative it is against a contradicting prompt, the more stable it is over time, the more expensive it is to change, and the more immutable it is in daily work. Roots are the few things that almost never change. Leaves are concrete and cheap to revise.',
          '',
          'THE ONE PLACEMENT QUESTION',
          'For every truth, ask: how often does this honestly change? Never, it is a root. Every sprint, it is a leaf or it does not belong in the tree at all. This single question decides depth better than any rule below.',
          '',
          'DURABLE VS VOLATILE (the rule that matters most)',
          'Add only durable truths. If a statement would be wrong in a few months, it does not belong in the tree. Keep these OUT: prices, plan tiers, current metrics, percentages, dates, version numbers, headcounts, "currently we are doing X". They go in a decision-record document instead. A simple test: if you would have to edit the node every quarter, it is volatile. The tree is for what the project IS, not for its current state. When you create a node, the server may attach a volatilityWarning if the content looks like it carries a changing figure; treat that as a signal to rewrite or drop the node.',
          '',
          'ONE NODE, ONE TRUTH',
          'Each node states exactly one truth. If a node joins two ideas with "and", or runs two sentences pulling different directions, split it. A node you cannot summarise in one clause is two nodes.',
          '',
          'ROOTS',
          'Give a distinct theme its own root rather than overloading another. Common roots are identity (what this fundamentally is), voice, positioning, audience, non-goals, but use what the project actually has, not a template. A tree with one giant root and everything beneath it has thrown the depth axis away. Several roots is the normal, healthy shape.',
          '',
          'SIBLING PARITY',
          'Nodes that share a parent should sit at a similar level of detail. If one child of "voice" is "warm and editorial" and its sibling is "we used an orange button on the pricing page", they do not belong at the same level. Push the specific one deeper or drop it.',
          '',
          'HARDNESS IS POSITIONAL, NOT ASSERTED',
          'You never decide how hard a node is. The server computes hardness from position and load and it is authoritative at read time. hardnessSet is only a hint: the server clamps it into the band the structure allows, raising it to a floor (a root is always hard) or lowering it to a ceiling (a shallow node cannot be softer than what hangs on it). When it clamps, the response carries a hardnessNote. Do not fight it, and never try to make a deep leaf "hard" by asserting 100. Position is the only lever; the server, not the prompt, decides what is hard.',
          '',
          'ANTI-PATTERNS, each one a defect:',
          '- A volatile figure parked in the tree (price, metric, date). Move it to a decision-record.',
          '- Several claims crammed into one node. Split them.',
          '- One mega-root with the whole project hanging off it. Promote the distinct themes to their own roots.',
          '- Siblings at wildly different detail levels. Re-level them.',
          '- A placeholder treeId like "my-project". Use the real project name.',
          '- Marketing adjectives with no truth content ("best-in-class", "innovative"). State what is actually true.',
          '- Duplicates. If create_node returns a similarTo hint, check it before adding and extend the existing node instead of forking a near-copy.',
          '',
          'HOW TO PROCEED',
          '1. Read the current protected core below so you neither contradict nor duplicate it.',
          '2. Identify the distinct top-level themes. Those become roots (parentId null).',
          '3. Under each root, nest the durable details using the parentId the root returned.',
          '4. After each create, glance at effectiveHardness and protected in the response, and at any hardnessNote, volatilityWarning or similarTo. Adjust before moving on.',
          '5. To maintain: update_node, move_node, delete_node. A protected node returns a cascade preview first; show it to the human and re-run with confirm: true only after they approve.',
          '',
          'A WORKED MINIATURE (fictional project "lumen", a focus timer):',
          '- root: identity = "Lumen is a single-purpose focus timer for deep-work sessions" (almost never changes, so a root, hard)',
          '- root: voice = "Calm and unintrusive: it never nags, gamifies or rewards" (a durable stance, so a root)',
          '- under identity: "Sessions are fixed-length and cannot be paused, by design" (a durable product truth, so a branch)',
          '- NOT a node: "The Pro plan is 4 euros a month" (a price, so volatile, belongs in a decision-record, not the tree)',
          'The price never enters the tree, and every node is one clean truth.',
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
