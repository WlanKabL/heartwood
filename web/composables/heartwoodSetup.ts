// Setup snippets for connecting an agent. Origin-aware: the same code serves the right
// host in dev (localhost:3000) and in production (the deployed domain), because the app is
// always served from the front door it should connect back to.

const origin = (): string =>
  import.meta.client ? window.location.origin : 'https://your-heartwood-host'

export const mcpUrl = (): string => `${origin()}/mcp`

export const rootsUrl = (treeId = 'my-project'): string => `${origin()}/trees/${treeId}/roots`

/**
 * One-line command: Claude Code registers Heartwood itself.
 * --scope user makes the server available in every project/folder, not just the directory
 * where the command is run. Without it the default "local" scope binds only to the current
 * working directory, so the server disappears when you open Claude Code elsewhere.
 * After running this the user must start a new Claude Code session — MCP tools load at
 * session start, not hot.
 */
export const mcpAddCommand = (token = 'YOUR_HW_TOKEN'): string =>
  `claude mcp add --transport http --scope user heartwood ${mcpUrl()} --header "Authorization: Bearer ${token}"`

/** Manual alternative for any MCP client: drop into .mcp.json. */
export const mcpJson = (token = 'hw_your-token'): string =>
  `{
  "mcpServers": {
    "heartwood": {
      "type": "http",
      "url": "${mcpUrl()}",
      "headers": { "Authorization": "Bearer ${token}" }
    }
  }
}`

/** SessionStart hook: auto-load the protected core into every new chat. */
export const hookSnippet = (token = 'hw_your-token', treeId = 'my-project'): string =>
  `{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command",
        "command": "curl -s -H \\"Authorization: Bearer ${token}\\" ${rootsUrl(treeId)}" } ] }
    ]
  }
}`

/** Paste into a Claude Code session that has Heartwood connected; the agent builds the first tree for you. */
export const bootstrapPrompt = (treeId = 'my-project'): string =>
  `You have the Heartwood MCP server connected (tools: get_tree, get_roots, create_node, and more).
Initialize my project's truth tree, treeId "${treeId}".

1. First ask me 4 to 6 sharp questions: what this project fundamentally is, who it is for, how it should sound, and what it is explicitly NOT.
2. From my answers, propose a small set of ROOT truths (e.g. identity, voice, positioning, audiences) plus a few nested branches. One node = one durable truth.
3. Create them with create_node (parentId: null for roots, the parent's id to nest). Keep anything volatile (prices, dates, metrics, versions) out of the tree entirely.
4. When done, show me get_tree and a one-line summary of the protected core.

Be concise. Propose, do not over-ask.`
