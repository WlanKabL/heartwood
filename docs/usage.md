# Running Heartwood (Phase 1)

A local HTTP MCP server with bearer-token auth. You connect it to Claude Code and build a project's truth tree through the real tools, with no seed script.

## 1. Start the server

PowerShell:

```powershell
$env:HEARTWOOD_TOKEN = 'your-secret'; pnpm start
```

bash:

```bash
HEARTWOOD_TOKEN=your-secret pnpm start
```

It listens on `http://localhost:8722/mcp`. All config is via env:

| Var | Required | Default | Meaning |
| --- | --- | --- | --- |
| `HEARTWOOD_TOKEN` | yes | — | bearer token the client must send |
| `PORT` | no | 8722 | HTTP port |
| `DB_PATH` | no | ./heartwood.db | SQLite file, or `:memory:` for ephemeral |

The server refuses to start without a token, so it is never unauthenticated by accident.

## 2. Connect from Claude Code

Add to your project's `.mcp.json` (or `~/.claude.json`):

```json
{
  "mcpServers": {
    "heartwood": {
      "type": "http",
      "url": "http://localhost:8722/mcp",
      "headers": { "Authorization": "Bearer your-secret" }
    }
  }
}
```

The token must match `HEARTWOOD_TOKEN`. A wrong or missing token is rejected with HTTP 401. That is the auth test: change the header to a wrong value and the server refuses every call.

## 3. Build the first tree by hand

In a Claude Code chat with the server connected, the agent has four tools. Build KeeperLog's tree through them, deepest truths first:

1. `get_tree { "treeId": "keeperlog" }` is empty at first.
2. Create the root:
   `create_node { "treeId": "keeperlog", "parentId": null, "label": "identity", "content": "KeeperLog is a portable, handover-ready animal record for reptile and exotics keepers" }`
   It comes back in band `root`.
3. Create the trunk under the root (voice, positioning), then branches (features like QR handover), then leaves (details). Pass `parentId` = the id the parent returned.
4. `get_tree` again returns the whole tree, each node with its server-computed `effectiveHardness` and `band`.

Watch the hardness fall as you go deeper. Try proposing `hardnessSet: 100` on a leaf: the server clamps it into the leaf's band. Position decides, not the number.

## The four tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_roots` | `{ treeId }` | the protected core (effective hardness >= 60), flat |
| `get_tree` | `{ treeId }` | the full tree, nested, every node with hardness and band |
| `get_subtree` | `{ treeId, nodeId }` | one node and its descendants |
| `create_node` | `{ treeId, parentId, label, content, hardnessSet? }` | the created node, resolved |

## Scope (Phase 1)

This is the single-user core: create plus read, one static token, no change-governance and no accounts. Editing protected nodes with cascade confirmation, and a multi-tenant account system with a registration frontend, are later phases (see [ROADMAP.md](../ROADMAP.md)).
