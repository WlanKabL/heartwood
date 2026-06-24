import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpDeps } from './server.js'
import { getProtectedNodes } from '../core/service.js'
import { formatTruths, runWorkflow } from '../core/workflow.js'

/**
 * Authoring guidance, exposed in BOTH worlds: as MCP prompts (slash-commands a human picks)
 * and as tools (which an agent can call on its own). The text lives once in the builders below;
 * an agent told "read the build_guide" can only act on that if build_guide is a tool, so the
 * tool registration in server.ts and the prompt registration here share the same source.
 */

const userMessage = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
})

const truthsFor = async (deps: McpDeps, treeId: string): Promise<string> =>
  formatTruths(await getProtectedNodes(deps.repo, treeId, deps.now()))

/**
 * The one authoring guide. Covers orientation (choose a treeId, understand the project, ask
 * adaptively) and the rules for a deep, coherent, English-language tree of durable truths.
 * With a treeId it also loads that tree's current protected core; without one it tells the
 * agent how to pick a treeId first.
 */
export const buildGuideText = async (deps: McpDeps, treeId?: string): Promise<string> => {
  const lines = [
    'You are building or extending a Heartwood truth tree: the durable truths about a project, stored as a hardened tree and served to AI agents. Follow this guide end to end. A sloppy tree is worse than none, because it is trusted. If you have no tree yet, start at ORIENTATION; if you already know the tree, skip to the rules.',
    '',
    'ORIENTATION (do this first if you do not yet have a tree)',
    '- Call list_trees to see what already exists. If a tree for this project is there, you are extending it: reuse its exact treeId. Only start a new one for a genuinely new project.',
    '- Choose the treeId as the project\'s real short name in kebab-case ("keeperlog", "zentrax", "heartwood"). NEVER a placeholder like "my-project", "project", "default" or "test". If you cannot tell what the project is called, ask the human one short question.',
    '- Understand the project from whatever durable sources exist before asking anything: a README, a CLAUDE.md or AGENTS.md, package.json, a docs/ or strategy folder, the conversation so far. For a non-software project (a brand, a person, a company) there may be no repo; use whatever the human points you to.',
    '- Ask exactly as many questions as the gap demands, no fixed number. Nothing if the project is already clear enough to write its roots correctly. A few targeted questions if some things are ambiguous. Many, in small batches, if little is written down (e.g. "this is my cooking Instagram"). The test for every truth: do you know it well enough to write a statement the human would not immediately correct? If not, ask.',
    '- Ask once whether Heartwood should be the single source of truth: should you move durable truths out of an existing file (an identity.md, a strategy doc) into the tree and leave that file as a short pointer, or keep the files and only mirror the truths here? Migrate or delete nothing until they answer.',
    '',
    'THE MODEL',
    'A tree is a small forest of roots with detail nested underneath. Depth is one axis on which four things move together: the deeper a node sits, the more authoritative it is against a contradicting prompt, the more stable it is over time, the more expensive it is to change, and the more immutable it is in daily work. Roots are the few things that almost never change. Leaves are concrete and cheap to revise.',
    '',
    'GO DEEP, NOT FLAT',
    'A serious project is not three roots with one line each. It has structure: roots (what it fundamentally is), then branches (subsystems, product areas, audiences, channels), then sub-branches and leaves (the specific durable truths under each). A tree that stops at three or four levels has almost certainly under-captured a real project. After placing a node, keep asking "what durable truths hang under this?" until you reach genuinely atomic ones. Breadth at the top, depth underneath: a complex product easily justifies dozens of nodes across five or more levels. Err toward more structure, not less.',
    '',
    'WRITE IN ENGLISH',
    'Write every node\'s content in English, even when the human is talking to you in another language. The tree is read by AI agents far more than by humans, and models read English more reliably and at lower token cost. Labels and ids stay English too. Translate the meaning across, do not store the other language.',
    '',
    'THE ONE PLACEMENT QUESTION',
    'For every truth, ask: how often does this honestly change? Never, it is a root. Every sprint, it is a leaf, or it does not belong in the tree at all. This single question decides depth better than any rule below.',
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
    '- A flat tree: three roots, one bullet each, for a project that clearly has more. Go deeper.',
    '- A volatile figure parked in the tree (price, metric, date). Move it to a decision-record.',
    '- Several claims crammed into one node. Split them.',
    '- One mega-root with the whole project hanging off it. Promote the distinct themes to their own roots.',
    '- Siblings at wildly different detail levels. Re-level them.',
    '- A placeholder treeId like "my-project". Use the real project name.',
    '- Node content in a language other than English. Rewrite it in English.',
    '- Marketing adjectives with no truth content ("best-in-class", "innovative"). State what is actually true.',
    '- Duplicates. If create_node returns a similarTo hint, check it before adding and extend the existing node instead of forking a near-copy.',
    '',
    'HOW TO PROCEED',
    '1. Read the current protected core below so you neither contradict nor duplicate it.',
    '2. Identify the distinct top-level themes. Those become roots (parentId null).',
    '3. Under each root, nest the durable details using the parentId the root returned, and keep nesting until the branch is genuinely exhausted.',
    '4. After each create, glance at effectiveHardness and protected in the response, and at any hardnessNote, volatilityWarning or similarTo. Adjust before moving on.',
    '5. To maintain: update_node, move_node, delete_node. A protected node returns a cascade preview first; show it to the human and re-run with confirm: true only after they approve.',
    '',
    'A WORKED MINIATURE (fictional project "lumen", a focus timer):',
    '- root: identity = "Lumen is a single-purpose focus timer for deep-work sessions" (almost never changes, so a root, hard)',
    '- root: voice = "Calm and unintrusive: it never nags, gamifies or rewards" (a durable stance, so a root)',
    '- under identity: "Sessions are fixed-length and cannot be paused, by design" (a durable product truth, so a branch)',
    '- under that branch: "A session, once started, survives an app restart" (a deeper, still-durable consequence, so a leaf)',
    '- NOT a node: "The Pro plan is 4 euros a month" (a price, so volatile, belongs in a decision-record, not the tree)',
    'The price never enters the tree, every node is one clean truth, and the branch goes deeper than one level.',
    '',
  ]

  const core = treeId
    ? [`Current protected core of "${treeId}":`, await truthsFor(deps, treeId)]
    : [
        'You have not named a treeId yet. Follow ORIENTATION above to pick the real project name, then call build_guide again with that treeId to load its current protected core before you extend it.',
      ]

  return [...lines, ...core].join('\n')
}

/** Flag where a draft contradicts a tree's protected truths. */
export const checkConsistencyText = async (
  deps: McpDeps,
  treeId: string,
  draft: string,
): Promise<string> =>
  [
    `Check the draft below against the protected truths of "${treeId}".`,
    'For each truth the draft touches, say whether the draft is consistent, and quote the conflict if not.',
    'Be strict: a protected truth is authoritative. End with a clear verdict: consistent, or a list of contradictions to fix.',
    '',
    'Project truths:',
    await truthsFor(deps, treeId),
    '',
    'Draft:',
    draft,
  ].join('\n')

export const registerWorkflows = (server: McpServer, deps: McpDeps): void => {
  server.registerPrompt(
    'build_guide',
    {
      title: 'Heartwood: how to build a coherent tree',
      description:
        'The full authoring guide: choose a treeId, understand the project, and build a deep, English-language tree of durable truths. Pass a treeId to also load that tree\'s current protected core.',
      argsSchema: { treeId: z.string().optional() },
    },
    async ({ treeId }) => userMessage(await buildGuideText(deps, treeId)),
  )

  server.registerPrompt(
    'check_consistency',
    {
      title: 'Heartwood: check a draft against the project truths',
      description: 'Flag where a draft (copy, plan, message, decision) contradicts the protected truths.',
      argsSchema: { treeId: z.string(), draft: z.string() },
    },
    async ({ treeId, draft }) => userMessage(await checkConsistencyText(deps, treeId, draft)),
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
