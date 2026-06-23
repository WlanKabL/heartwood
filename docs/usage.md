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

The server refuses to start without a token, so it is never unauthenticated by accident. `pnpm dev` does the same with auto-reload.

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

> MCP servers are loaded when a Claude Code session starts. Add the config, then open a **new** chat so it picks up.

## 3. Build the tree by hand

In a Claude Code chat with the server connected, the agent has four tools. A tree may have **several roots** (a forest); use that instead of overloading one node. Build deepest, most stable truths as roots, details below them:

1. `get_tree { "treeId": "keeperlog" }` is empty at first.
2. Create a root:
   `create_node { "treeId": "keeperlog", "parentId": null, "label": "identity", "content": "KeeperLog is a portable, handover-ready animal record for reptile and exotics keepers" }`
   It comes back `protected: true`.
3. Add more roots for the other top-level themes (voice, positioning, product/features, audiences), then nest details under each with `parentId` = the id the parent returned.
4. `get_tree` returns the forest, each node with its server-computed `effectiveHardness` (0–100) and `protected` flag.

Watch the hardness fall as you go deeper. Try proposing `hardnessSet: 100` on a deep node: the server clamps it, and the node stays unprotected. Position decides, not the number.

## The tools

Read:

| Tool | Input | Returns |
| --- | --- | --- |
| `get_roots` | `{ treeId }` | the protected core (hardness >= 60), flat |
| `get_tree` | `{ treeId }` | the forest (list of roots), nested, every node with hardness and `protected` |
| `get_subtree` | `{ treeId, nodeId }` | one node and its descendants |

Write (protected nodes need `confirm: true`, which returns a cascade preview first):

| Tool | Input | Returns |
| --- | --- | --- |
| `create_node` | `{ treeId, parentId, label, content, hardnessSet? }` | the created node |
| `update_node` | `{ treeId, nodeId, content?, label?, hardnessSet?, confirm? }` | the node, or a cascade preview |
| `move_node` | `{ treeId, nodeId, newParentId, confirm? }` | the node, or a cascade preview |
| `delete_node` | `{ treeId, nodeId, confirm? }` | the deleted ids, or a cascade preview |

## Workflows

Workflows are MCP prompts (slash-commands) that load the project's truths and lay out a procedure. Two are built in and generic:

| Prompt | Args | What it does |
| --- | --- | --- |
| `build_guide` | `{ treeId }` | how to author a coherent tree, with the current core loaded |
| `check_consistency` | `{ treeId, draft }` | flags where a draft (copy, plan, message, decision) contradicts the truths |

The rest are **yours**. Define your own with the `define_workflow` tool, then run them:

| Tool | Input | Returns |
| --- | --- | --- |
| `define_workflow` | `{ treeId, name, description, template }` | the workflow |
| `list_workflows` | `{ treeId }` | your workflows |
| `delete_workflow` | `{ treeId, name }` | confirmation |
| `run_workflow` | `{ treeId, name, input? }` | the filled-in text (also the `/run_workflow` prompt) |

A `template` is plain text with two placeholders: `{{truths}}` is replaced with the protected core, `{{input}}` with the caller's input. The engine is content-agnostic, the same mechanism serves a developer's `plan_feature`, a company's `draft_okr`, a person's `write_message`. Example:

```
define_workflow name="plan_post"
  template="On-brand truths:\n{{truths}}\n\nPlan a post about: {{input}}. Keep it consistent with the truths above."
```

Then `run_workflow name="plan_post" input="the new collab"` returns the ready-to-use prompt.

## Scope (Phase 1)

This is the single-user core: create plus read, one static token, no change-governance and no accounts. Editing protected nodes with cascade confirmation, a multi-tenant account system, and build-methodology guidance (how to author a coherent tree) are later phases (see [ROADMAP.md](../ROADMAP.md)).
