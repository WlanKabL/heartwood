# Running Heartwood

A multi-tenant HTTP MCP server backed by Postgres. You log in with GitHub, mint a personal
API token on the account page, and connect that token to Claude Code. Every tenant gets its
own forest of trees; one token only ever sees its owner's data.

## 1. Start Postgres and run migrations

Heartwood stores everything in Postgres. Start one (any instance reachable via `DATABASE_URL`):

```bash
docker run -d --name heartwood-pg -p 5432:5432 \
  -e POSTGRES_USER=heartwood -e POSTGRES_PASSWORD=heartwood -e POSTGRES_DB=heartwood \
  postgres:16
```

Then apply the schema migrations:

```bash
pnpm db:migrate
```

## 2. Configure the environment

Copy `.env.example` to `.env` and fill it in. All config is validated on startup, so the
server refuses to boot with anything missing or malformed.

| Var | Required | Default | Meaning |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Postgres connection string |
| `GITHUB_CLIENT_ID` | yes | — | GitHub OAuth app client id |
| `GITHUB_CLIENT_SECRET` | yes | — | GitHub OAuth app client secret |
| `SESSION_SECRET` | yes | — | cookie session key, **at least 32 characters** |
| `PUBLIC_URL` | yes | — | publicly reachable base URL of this server, e.g. `http://localhost:8722` |
| `PORT` | no | 8722 | HTTP port |

`SESSION_SECRET` signs the browser login cookie; keep it secret and stable (rotating it logs
everyone out). `PUBLIC_URL` is the base the OAuth callback is built from, so it must match what
GitHub redirects back to.

## 3. Register a GitHub OAuth app

Create one at <https://github.com/settings/developers> → **New OAuth App**:

- **Homepage URL:** your `PUBLIC_URL` (e.g. `http://localhost:8722`).
- **Authorization callback URL:** `${PUBLIC_URL}/auth/github/callback`
  (e.g. `http://localhost:8722/auth/github/callback`).

Copy the generated **Client ID** and a **Client Secret** into `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`.

Now start the server:

```bash
pnpm start
```

It listens on `${PUBLIC_URL}` and speaks MCP over Streamable HTTP at `/mcp`. `pnpm dev` does
the same with auto-reload.

## 4. Log in and mint a token

1. Open `PUBLIC_URL` in a browser and click **Log in with GitHub**.
2. After the redirect back, you land on your account page.
3. Under **Create token**, give the token a name and submit. The raw token is shown **once** —
   copy it immediately, it is never displayed again. Only a hash is stored, so a lost token
   cannot be recovered, only deleted and replaced.

The token is the only credential Claude Code needs. It identifies you to the server, and the
server scopes every read and write to your account.

## 5. Connect from Claude Code

Run this once — Claude Code registers Heartwood globally:

```bash
claude mcp add --transport http --scope user heartwood https://heartwood.wlankabl.com/mcp --header "Authorization: Bearer YOUR_HW_TOKEN"
```

Replace `YOUR_HW_TOKEN` with the `hw_...` token you minted in step 4. The token is shown once
on the tokens page; copy it before leaving.

**Why `--scope user`?** The default scope is `local`, which binds the server only to the
directory where the command runs. With `--scope user` the server is available in every
project and folder. Without it, the server disappears whenever you open Claude Code from a
different directory.

**After running it, start a new Claude Code session.** MCP tools are loaded at session start,
not hot. The server will not appear in an already-running session.

A wrong or missing token is rejected with HTTP 401, and a token only ever resolves to its
owner's trees — two tenants never see each other's data.

---

### Local development (contributors only)

If you are running Heartwood locally, point the URL at your local instance instead:

```bash
claude mcp add --transport http --scope user heartwood http://localhost:8722/mcp --header "Authorization: Bearer YOUR_HW_TOKEN"
```

Or wire it by hand in `.mcp.json` (project-local, token stays out of git if you use
`.mcp.json` — but `--scope user` via the CLI is the safer default):

```json
{
  "mcpServers": {
    "heartwood": {
      "type": "http",
      "url": "http://localhost:8722/mcp",
      "headers": { "Authorization": "Bearer YOUR_HW_TOKEN" }
    }
  }
}
```

To make a session load your protected core automatically, point a `SessionStart` hook at the
roots endpoint with the same token. In `.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -H \"Authorization: Bearer YOUR_HW_TOKEN\" https://heartwood.wlankabl.com/trees/keeperlog/roots"
          }
        ]
      }
    ]
  }
}
```

The endpoint returns the protected core (the high-hardness truths) for the named tree, gated by
the same bearer token. Swap `keeperlog` for whichever tree id you are working on.

A better alternative is to use the `bin/hook.mjs` script that ships with Heartwood. It fetches
the protected core and also prints a "Maintaining this tree" rules block that tells the agent to
capture new durable truths during the session. Point the hook at the roots endpoint:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node C:/path/to/heartwood/bin/hook.mjs https://heartwood.wlankabl.com YOUR_HW_TOKEN keeperlog"
          }
        ]
      }
    ]
  }
}
```

To pair this with a gentle end-of-session reminder, add a `SessionEnd` hook using
`bin/session-nudge.mjs`. It reads the `SessionEnd` payload from stdin, checks whether the
session was substantive (transcript longer than ~40 lines), and if so prints one line reminding
the human to capture any new durable truth with `create_node`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "prompt_input_exit",
        "hooks": [
          {
            "type": "command",
            "command": "node C:/path/to/heartwood/bin/session-nudge.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

The nudge is deliberately gentle: it is a reminder shown to the human after the session ends, it
never blocks, and it cannot cause a loop. Short or trivial sessions receive no output at all. On
any error the hook exits 0 silently. The `SessionStart` hook also nudges the agent itself via
the "Maintaining this tree" rules block, so both ends of the session reinforce the same habit.

## 6. Build the tree by hand

In a Claude Code chat with the server connected, the agent has the tools below. A tree may have
**several roots** (a forest); use that instead of overloading one node. Build deepest, most
stable truths as roots, details below them:

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
| `init_tree` | none | first-time setup for a project with no tree yet: pick a real treeId, understand the project, ask only as much as the gap demands, build roots first |
| `build_guide` | `{ treeId }` | thorough rules for authoring a coherent tree, with the current core loaded |
| `check_consistency` | `{ treeId, draft }` | flags where a draft (copy, plan, message, decision) contradicts the truths |

Starting a brand-new project? Run `/init_tree` first to choose the treeId and shape the roots, then `/build_guide` to keep authoring with the full ruleset.

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

## Scope

This is the multi-tenant core, live in production: GitHub login, per-account API tokens, and
tenant-scoped trees on Postgres, with cascade-confirmed editing of protected nodes. Every store
instance is bound to a `userId`, so isolation cannot be forgotten and is enforced at the HTTP/MCP
boundary (see `src/http/isolation.test.ts`). Build-methodology guidance ships as the `init_tree`
and `build_guide` prompts above. The one remaining phase is opening up (OSS release, public
trees); see [ROADMAP.md](../ROADMAP.md).
