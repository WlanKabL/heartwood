# Multi-Tenant Backend — Design

- **Date:** 2026-06-23
- **Status:** Approved, ready for implementation plan
- **Sub-project:** 1 of 3 (Multi-Tenant Backend → Frontend → Deployment)

## Goal

Turn Heartwood's single-user core into a hosted, multi-tenant backend. This is the
foundation the frontend and deployment sub-projects build on. We go from one global
token and a local SQLite file to real accounts, per-user trees, and Postgres, without
touching the protocol-agnostic core (engine, hardness, write-governance, workflows).

## Scope

**In this sub-project:**

- Postgres + Drizzle schema and migrations.
- GitHub-OAuth login + a browser session for humans.
- API-token management (generate, list, revoke) for the MCP / Claude Code connection.
- User-scoped MCP tools and the user-scoped session-hook endpoint.
- A tenant-scoped repository port: `userId` is part of every access and cannot be
  forgotten. This is the security seam of the whole change.
- A deliberately minimal, server-rendered login + token page so the backend is
  end-to-end usable on its own, before the real frontend exists.

**Explicitly out (later sub-projects):**

- The SPA frontend and the tree-CRUD REST API for visual editing (sub-project 2).
- Deployment / hosting (sub-project 3).
- The `password` and `magic_link` auth flows. The data model supports them now; only
  the GitHub flow is implemented.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Order | Backend foundation first | Frontend and deployment build on it; nothing real exists without accounts. |
| Auth model | `identities` abstraction for all three providers | A new provider is a row, not a rebuild. Decouples login method from user. |
| Auth scope now | Only GitHub-OAuth implemented | Technical audience all have GitHub; no password handling, no email infra, smallest surface. |
| Tenancy | `(userId, treeId)` namespace | Each user owns their tree names; no global uniqueness; the MCP client keeps sending `treeId` unchanged. |
| Storage | Postgres | Hosted multi-user target: real concurrency, network access, managed everywhere. We touch storage anyway. |
| DB layer | Drizzle | Schema defined in TypeScript, types + migrations from it, light, no codegen client. |
| HTTP layer | Fastify | Growing API (OAuth callbacks, cookies, ~10 endpoints); mature plugins (`@fastify/oauth2`, `@fastify/cookie`). |
| Statefulness | Stays stateless | Hosting does not need stateful; stateless scales horizontally. The transport is a swappable layer if a push use case ever appears. |

## Data model

New tables, plus a `user_id` column on the two existing ones. Defined in Drizzle.

```
users                            the canonical identity
  id            uuid pk
  email         text unique      from GitHub
  display_name  text
  created_at    timestamptz
  updated_at    timestamptz

identities                       login methods, linked to a user
  id                   uuid pk
  user_id              uuid fk → users.id
  provider             text      'github' | 'password' | 'magic_link'
  provider_account_id  text      GitHub numeric id; for password/magic = email
  password_hash        text?     only for 'password'
  created_at           timestamptz
  unique (provider, provider_account_id)

api_tokens                       for the MCP connection (Claude Code)
  id            uuid pk
  user_id       uuid fk → users.id
  name          text             e.g. "laptop", "pi"
  token_hash    text unique      we store only the hash
  prefix        text             display only: "hw_a1b2…"
  created_at    timestamptz
  last_used_at  timestamptz?

nodes      + user_id  uuid fk → users.id    treeId now unique only within (user_id, tree_id)
workflows  + user_id  uuid fk → users.id
```

The `identities` table is the abstraction we agreed on: today only `github`, later
`password` and `magic_link` as pure row entries, no rebuild.

## Auth: two separate paths

Two distinct mechanisms, by audience.

1. **Human in the browser** logs in via GitHub-OAuth. GitHub returns the profile; we
   find-or-create `users` + `identities(github)`, then set a session as an HTTP-only,
   signed cookie. This is the browser path.

2. **Agent over MCP** (Claude Code) uses no cookie. It sends an **API token**. The user
   generates it once in the frontend (`hw_…`, shown in clear text only that one time),
   puts it in `.mcp.json`. On every request the server hashes the bearer token, looks it
   up in `api_tokens`, resolves `user_id`, and every tool call runs on `(user_id, treeId)`.

The current global `HEARTWOOD_TOKEN` is removed and replaced by these user-bound API
tokens. The existing Claude Code setup changes in exactly one line: a different token in
the header. The SessionStart hook works unchanged; its token now resolves a user.

**Token format:** raw token is `hw_` + 32 random bytes (base64url). Stored as a SHA-256
hash (high-entropy secret, so no PBKDF2 needed unlike passwords). `prefix` keeps the
first chars for display. The raw token is returned exactly once, on creation.

**Session:** HTTP-only, secure, signed cookie carrying the `userId`, via `@fastify/cookie`
plus a signed-token mechanism (`@fastify/jwt` or `@fastify/secure-session` — settled in
the plan). Logout clears the cookie.

## Code changes

Clear, bounded stops. The core is untouched.

- `config.ts`: remove `HEARTWOOD_TOKEN`, `DB_PATH`. Add `DATABASE_URL`,
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `PUBLIC_URL`. Still zod.
- `http/auth.ts`: the string compare becomes token→`userId` (hash lookup in `api_tokens`)
  plus session→`userId` for the browser.
- `http/server.ts` → Fastify: `/mcp` resolves `userId` and passes it to the tools; the
  new routes are registered here. The MCP transport runs on the raw req/res of one route.
- `storage/`: `SqliteTreeRepository` / `SqliteWorkflowRepository` become Postgres
  variants (Drizzle). The InMemory implementations stay for tests.
- `core/repository.ts` (+ `workflow-repository.ts`): the port becomes **tenant-scoped**,
  so `userId` is part of every access and cannot be forgotten. Exact form (per-request
  scoped repo vs `userId` parameter on each method) is decided in the plan; the
  invariant is that tenant isolation is enforced, not optional.
- `mcp/server.ts`: tools receive the resolved `userId` from the request context and
  delegate to the tenant-scoped repo. Tool signatures toward the agent do not change.
- `main.ts`: wiring onto Postgres plus the new routes.

## API surface

- `GET /auth/github`, `GET /auth/github/callback`, `POST /auth/logout`
- `GET /api/me` — the current user
- `GET /api/tokens`, `POST /api/tokens`, `DELETE /api/tokens/:id` — manage API tokens
- existing, now user-scoped: `ALL /mcp`, `GET /trees/:treeId/roots`
- the minimal server-rendered pages: `GET /` (login or token view), the OAuth handoff

The tree-CRUD REST for visual editing comes with the frontend (sub-project 2) and reuses
the same core use-cases as the MCP tools: one core, two adapters.

## Standalone usability

So this block is complete on its own and does not wait for the frontend (the
"end-to-end or not at all" rule), it ships a deliberately minimal, server-rendered
login-plus-token flow: log in with GitHub, generate a token, copy it, done. Ugly but
complete. The polished SPA is sub-project 2.

## Migration & testing

- Drizzle migrations for the schema.
- The existing repository contract test runs additionally against Postgres (local
  Postgres via Docker), proving InMemory and Postgres stay interchangeable.
- New and critical: **tenant-isolation tests** — user A cannot read or write user B's
  tree through any path (repo, MCP tool, hook endpoint).
- Token hashing and token→user resolution tests.
- OAuth flow tested with the GitHub API mocked.
- The existing core tests stay green unchanged; only the wiring moves.

## Out-of-scope reminders

- No `password` / `magic_link` implementation yet (model only).
- No SPA, no visual tree editing, no deployment in this sub-project.
