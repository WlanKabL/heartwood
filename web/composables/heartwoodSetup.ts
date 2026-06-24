// Setup snippets for connecting an agent. Origin-aware: the same code serves the right
// host in dev (localhost:3000) and in production (the deployed domain), because the app is
// always served from the front door it should connect back to.

const origin = (): string =>
  import.meta.client ? window.location.origin : 'https://your-heartwood-host'

export const mcpUrl = (): string => `${origin()}/mcp`

export const rootsUrl = (treeId = 'YOUR_TREE_ID'): string => `${origin()}/trees/${treeId}/roots`

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
export const hookSnippet = (token = 'hw_your-token', treeId = 'YOUR_TREE_ID'): string =>
  `{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command",
        "command": "curl -s -H \\"Authorization: Bearer ${token}\\" ${rootsUrl(treeId)}" } ] }
    ]
  }
}`

/** Paste into a Claude Code session that has Heartwood connected; the agent loads the guide and builds the tree. */
export const bootstrapPrompt = (): string =>
  `Capture this project's durable truth as a Heartwood tree.

1. Confirm you can reach the Heartwood MCP server: call list_trees. If that errors, Heartwood is not connected, so tell me and stop here.
2. Call the build_guide tool to load Heartwood's full authoring guide.
3. Follow that guide end to end: choose the right treeId, understand the project, ask me what it needs, and build the tree.`
