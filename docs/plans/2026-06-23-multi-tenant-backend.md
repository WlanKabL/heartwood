# Multi-Tenant Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Heartwood's single-user core into a hosted multi-tenant backend: accounts (GitHub-OAuth), per-user trees, API tokens for MCP, on Postgres, without touching the protocol-agnostic core.

**Architecture:** A tenant-scoped repository (every store instance is bound to a `userId`, so tenant isolation cannot be forgotten) sits under the unchanged core. Two auth paths: a signed session cookie for the browser, a hashed API token for the MCP agent. Fastify replaces the hand-rolled router; Drizzle + Postgres replace SQLite.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, Postgres (`pg`), `@fastify/oauth2`, `@fastify/secure-session`, `@fastify/cookie`, vitest. Existing `node:sqlite` kept only for the one-off data import.

---

## File Structure

```
docker-compose.yml                NEW   local Postgres (dev + test DB)
drizzle.config.ts                 NEW   drizzle-kit config
src/config.ts                     MOD   new env vars, drop HEARTWOOD_TOKEN/DB_PATH
src/storage/schema.ts             NEW   Drizzle schema (users, identities, api_tokens, nodes, workflows)
src/storage/db.ts                 NEW   pg pool + drizzle instance factory
src/storage/postgres-trees.ts     NEW   user-bound TreeRepository (Drizzle)
src/storage/postgres-workflows.ts NEW   user-bound WorkflowRepository (Drizzle)
src/storage/sqlite.ts             DEL   replaced by postgres-trees (kept transiently for import)
src/storage/sqlite-workflows.ts   DEL   replaced by postgres-workflows
src/core/repository.ts            MOD   port becomes user-bound factory; InMemory follows
src/core/workflow-repository.ts   MOD   same treatment
src/auth/tokens.ts                NEW   generate/hash/resolve API tokens
src/auth/users.ts                 NEW   find-or-create user + identity
src/auth/session.ts               NEW   session cookie helpers
src/http/server.ts                MOD   Fastify app; registers all routes
src/http/mcp-route.ts             NEW   /mcp behind token auth, passes userId to tools
src/http/auth-routes.ts           NEW   /auth/github, callback, logout
src/http/api-routes.ts            NEW   /api/me, /api/tokens CRUD
src/http/pages.ts                 NEW   minimal server-rendered login + token page
src/mcp/server.ts                 MOD   buildMcpServer takes a user-bound repo set
src/main.ts                       MOD   wiring onto Postgres + Fastify
scripts/import-sqlite.ts          NEW   one-off SQLite -> Postgres import
migrations/                       NEW   drizzle-generated SQL
```

Migrations are split by responsibility: storage talks to the DB, auth owns identity/token logic, http owns transport and routing, the core stays DB- and transport-agnostic.

---

## Phase A — Postgres + Schema foundation

### Task 1: Dependencies, local Postgres, config

**Files:**
- Create: `docker-compose.yml`, `drizzle.config.ts`
- Modify: `package.json`, `src/config.ts`, `.env.example`, `src/config.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add fastify @fastify/cookie @fastify/oauth2 @fastify/secure-session @fastify/formbody drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

- [ ] **Step 2: Add local Postgres**

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: heartwood
      POSTGRES_PASSWORD: heartwood
      POSTGRES_DB: heartwood
    ports: ['5432:5432']
    volumes: ['heartwood_pg:/var/lib/postgresql/data']
volumes:
  heartwood_pg:
```

Tests use a separate database `heartwood_test` on the same server (created in Task 4's setup).

- [ ] **Step 3: Write the failing config test**

In `src/config.test.ts`, replace the token assertions with the new shape:
```ts
it('parses the multi-tenant env', () => {
  const cfg = loadConfig({
    DATABASE_URL: 'postgres://u:p@localhost:5432/heartwood',
    GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'x'.repeat(32), PUBLIC_URL: 'http://localhost:8722',
  })
  expect(cfg.databaseUrl).toContain('postgres://')
  expect(cfg.github.clientId).toBe('id')
})
it('rejects a missing DATABASE_URL', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
})
```

- [ ] **Step 4: Run it, verify it fails** — `pnpm test src/config.test.ts` → FAIL.

- [ ] **Step 5: Rewrite `config.ts`**

```ts
const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8722),
  DATABASE_URL: z.string().url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  PUBLIC_URL: z.string().url(),
})

export interface HeartwoodConfig {
  port: number
  databaseUrl: string
  github: { clientId: string; clientSecret: string }
  sessionSecret: string
  publicUrl: string
}
```
Map `parsed.data` into that shape. Update `.env.example` to the new vars.

- [ ] **Step 6: Run config tests, verify pass. Commit.**

```bash
git add -A && git commit -m "feat: postgres-era config + local db compose"
```

### Task 2: Drizzle schema + first migration + db connection

**Files:**
- Create: `src/storage/schema.ts`, `src/storage/db.ts`
- Create: `migrations/` (generated)

- [ ] **Step 1: Define the schema** (`src/storage/schema.ts`)

```ts
import { pgTable, uuid, text, integer, timestamp, unique } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ providerAccount: unique().on(t.provider, t.providerAccountId) }))

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

// nodes keep TEXT id + ISO-string timestamps to match the core's TreeNode unchanged.
export const nodes = pgTable('nodes', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  treeId: text('tree_id').notNull(),
  parentId: text('parent_id'),
  label: text('label').notNull(),
  content: text('content').notNull(),
  hardnessSet: integer('hardness_set'),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastConfirmedAt: text('last_confirmed_at').notNull(),
})

export const workflows = pgTable('workflows', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  treeId: text('tree_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  template: text('template').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => ({ pk: unique().on(t.userId, t.treeId, t.name) }))
```

- [ ] **Step 2: db connection factory** (`src/storage/db.ts`)

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

export type Db = ReturnType<typeof drizzle<typeof schema>>

export const createDb = (databaseUrl: string): { db: Db; pool: pg.Pool } => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  return { db: drizzle(pool, { schema }), pool }
}
```

- [ ] **Step 3: `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/storage/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 4: Generate the migration** — `pnpm exec drizzle-kit generate`. Add scripts `db:generate` and `db:migrate` (`drizzle-kit migrate`) to `package.json`.

- [ ] **Step 5: Apply it against the dev DB** — `docker compose up -d db; pnpm db:migrate`. Expected: tables created.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat: drizzle schema + first migration"`

---

## Phase B — Tenant-scoped storage

### Task 3: User-bound repository port + InMemory

The port changes from a free store to a **factory bound to a user**. Every method is implicitly scoped; `userId` is set once at construction and applied as a `WHERE user_id = ...` on every query.

**Files:**
- Modify: `src/core/repository.ts`, `src/core/workflow-repository.ts`
- Modify: the repository contract test (find it under `src/**/*.test.ts`)

- [ ] **Step 1: New port shape** (`src/core/repository.ts`)

```ts
// The factory: hands out a repository already scoped to one tenant.
export interface TreeStore {
  forUser(userId: string): TreeRepository
}

// Methods unchanged in signature; the instance is user-bound, so callers
// (the core) never pass userId and cannot cross tenants.
export interface TreeRepository {
  listNodes(treeId: string): Promise<TreeNode[]>
  getNode(id: string): Promise<TreeNode | undefined>
  insertNode(node: TreeNode): Promise<void>
  updateNode(node: TreeNode): Promise<void>
  deleteNode(id: string): Promise<void>
  listTreeIds(): Promise<string[]>
}
```

`TreeNode` is unchanged (no `userId` field): the bound repo stamps `user_id` on insert from its binding, and filters every read/write by it. `getNode`/`updateNode`/`deleteNode` resolve only rows owned by the bound user (a foreign id returns undefined / throws "unknown node id", never another tenant's row).

- [ ] **Step 2: Rewrite `InMemoryTreeRepository` as `InMemoryTreeStore`**

One shared `Map`, `forUser(userId)` returns a view filtering by an internal `userId→node` ownership map. Same for `InMemoryWorkflowStore`.

- [ ] **Step 3: Update the contract test** to construct via `store.forUser('user-a')`, and add one isolation assertion: a node inserted by `user-a` is invisible to `store.forUser('user-b')`.

- [ ] **Step 4: Run, fix the core call sites** (`create.ts`, `write.ts`, `service.ts`, `workflow.ts`) so they accept a `TreeRepository` exactly as before — signatures there do **not** change, only how the repo is obtained.

- [ ] **Step 5: Full unit suite green. Commit.** `git commit -m "refactor: tenant-scoped repository port (InMemory)"`

### Task 4: Postgres repositories + contract test against Postgres

**Files:**
- Create: `src/storage/postgres-trees.ts`, `src/storage/postgres-workflows.ts`
- Create/Modify: the contract test to run twice (InMemory + Postgres)

- [ ] **Step 1: Test setup for Postgres** — a `beforeAll` that connects to `heartwood_test`, runs migrations, and a `beforeEach` that truncates `nodes, workflows, api_tokens, identities, users` and seeds two users (`user-a`, `user-b`). Guard: skip the Postgres run if `DATABASE_URL` is unset, so unit-only runs still pass.

- [ ] **Step 2: Implement `PostgresTreeStore`**

```ts
export class PostgresTreeStore implements TreeStore {
  constructor(private readonly db: Db) {}
  forUser(userId: string): TreeRepository {
    return new PostgresTreeRepository(this.db, userId)
  }
}
```
`PostgresTreeRepository` runs Drizzle queries with `eq(nodes.userId, this.userId)` on every read/write and sets `userId: this.userId` on insert. Map Drizzle rows to `TreeNode` (drop `userId` from the returned object).

- [ ] **Step 3: Run the contract suite against Postgres** — same assertions as InMemory, including the cross-tenant isolation case. Expected: PASS for both backends, proving they are interchangeable.

- [ ] **Step 4: Same for `PostgresWorkflowStore`.**

- [ ] **Step 5: Commit.** `git commit -m "feat: postgres tenant-scoped repositories + contract tests"`

### Task 5: Thread userId from MCP into the bound repo

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1:** Change `McpDeps` so the server is built per request from a resolved user:
```ts
export interface McpDeps {
  trees: TreeRepository      // already bound to the request's user
  workflows: WorkflowRepository
  now: () => Date
}
```
`buildMcpServer(deps)` is unchanged internally; the HTTP layer (Task 7) constructs `deps` by calling `store.forUser(userId)`. The tools still call `deps.trees.listNodes(treeId)` etc.

- [ ] **Step 2:** Update existing MCP integration tests to build deps from a `store.forUser('user-a')`.

- [ ] **Step 3:** Full suite green. Commit. `git commit -m "refactor: mcp server consumes a user-bound repo set"`

---

## Phase C — MCP auth (token path)

### Task 6: API token module

**Files:**
- Create: `src/auth/tokens.ts`, `src/auth/tokens.test.ts`

- [ ] **Step 1: Failing tests**
```ts
it('generates a hw_-prefixed token and a stable hash', () => {
  const t = generateToken()
  expect(t.raw.startsWith('hw_')).toBe(true)
  expect(t.prefix).toBe(t.raw.slice(0, 11))
  expect(hashToken(t.raw)).toBe(t.hash)
})
it('hash is deterministic and differs per token', () => {
  expect(hashToken('hw_x')).toBe(hashToken('hw_x'))
  expect(generateToken().hash).not.toBe(generateToken().hash)
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** (`src/auth/tokens.ts`)
```ts
import { randomBytes, createHash } from 'node:crypto'
const PREFIX = 'hw_'
export const hashToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex')
export const generateToken = (): { raw: string; hash: string; prefix: string } => {
  const raw = PREFIX + randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 11) }
}
```

- [ ] **Step 4: Resolve function + test** — `resolveToken(db, rawHeader): Promise<string | null>` extracts the bearer, hashes it, looks up `api_tokens` by `tokenHash`, updates `lastUsedAt`, returns `userId` or null. Test against Postgres with a seeded token (hit) and a garbage token (null).

- [ ] **Step 5: Commit.** `git commit -m "feat: api token generate/hash/resolve"`

### Task 7: Fastify server, user-scoped /mcp and hook

**Files:**
- Create: `src/http/server.ts` (rewrite), `src/http/mcp-route.ts`
- Modify: `src/main.ts`

- [ ] **Step 1:** Build the Fastify app skeleton with `@fastify/cookie`, `@fastify/formbody`, and `@fastify/secure-session` (key from `SESSION_SECRET`). Expose `buildServer(deps)` returning the Fastify instance for tests.

- [ ] **Step 2: `mcp-route.ts`** — register `ALL /mcp`: resolve the bearer via `resolveToken`; on null return 401; else build `McpDeps` from `store.forUser(userId)` and drive `StreamableHTTPServerTransport` on `request.raw` / `reply.raw` (call `reply.hijack()` so Fastify yields the socket).

- [ ] **Step 3:** Re-add `GET /trees/:treeId/roots` resolving the token to a user, returning that user's protected core. The `bin/hook.mjs` script is unchanged.

- [ ] **Step 4: Tests** — an authed `/mcp` initialize handshake succeeds for a seeded token; an unauthed one is 401; the roots endpoint returns only the bound user's nodes.

- [ ] **Step 5: Commit.** `git commit -m "feat: fastify server, token-authed user-scoped mcp + hook"`

---

## Phase D — Browser auth (OAuth + session)

### Task 8: GitHub OAuth + find-or-create user

**Files:**
- Create: `src/auth/users.ts`, `src/auth/session.ts`, `src/http/auth-routes.ts`

- [ ] **Step 1: `users.ts`** — `findOrCreateGithubUser(db, profile): Promise<string>` (returns `userId`): in a transaction, look up `identities` by `(provider:'github', providerAccountId)`; if found return its `userId`; else insert `users` (email, displayName) + `identities(github)` and return the new id. Test against Postgres: first call creates, second call with same GitHub id reuses.

- [ ] **Step 2: `session.ts`** — `setUserSession(reply, userId)` writes `userId` into the secure session; `getUserSession(request): string | null` reads it; `clearSession(reply)`. Test with a Fastify inject round-trip.

- [ ] **Step 3: `auth-routes.ts`** — register `@fastify/oauth2` for GitHub (`PUBLIC_URL` + `/auth/github/callback` as redirect). `GET /auth/github` starts the flow; the callback exchanges the code, fetches the GitHub profile (`GET https://api.github.com/user` + emails), calls `findOrCreateGithubUser`, sets the session, redirects to `/`. `POST /auth/logout` clears the session.

- [ ] **Step 4: Test the callback** with the GitHub token-exchange and profile fetch mocked; assert a user row exists and the session cookie is set.

- [ ] **Step 5: Commit.** `git commit -m "feat: github oauth login + session"`

### Task 9: Account + token API routes

**Files:**
- Create: `src/http/api-routes.ts`

- [ ] **Step 1: A `requireSession` preHandler** — 401 if `getUserSession` is null, else attach `userId` to the request.

- [ ] **Step 2: Routes (all behind `requireSession`)**
  - `GET /api/me` → `{ id, email, displayName }`.
  - `GET /api/tokens` → list (id, name, prefix, createdAt, lastUsedAt) for the user — never the hash.
  - `POST /api/tokens` `{ name }` → `generateToken`, insert, return `{ raw }` **once**.
  - `DELETE /api/tokens/:id` → delete only if owned by the session user.

- [ ] **Step 3: Tests** — create returns a raw token once; list never exposes the hash; a user cannot delete another user's token (404).

- [ ] **Step 4: Commit.** `git commit -m "feat: account + api-token routes"`

### Task 10: Minimal server-rendered login + token page

**Files:**
- Create: `src/http/pages.ts`

- [ ] **Step 1:** `GET /` — if no session, render a tiny HTML page with a "Login with GitHub" link to `/auth/github`. If a session exists, render the user's email, the list of tokens (name + prefix), a `<form POST /api/tokens>` to create one, and, right after creation, the raw token shown once with a copy hint. Plain HTML strings, no framework.

- [ ] **Step 2:** A smoke test asserting the logged-out page contains the GitHub link and the logged-in page lists tokens. Keep it deliberately ugly; the real SPA is sub-project 2.

- [ ] **Step 3: Commit.** `git commit -m "feat: minimal server-rendered login + token page"`

---

## Phase E — Data import + hardening

### Task 11: One-off SQLite → Postgres import

**Files:**
- Create: `scripts/import-sqlite.ts`

- [ ] **Step 1:** A script taking `--sqlite <path> --user <userId>`: open the old SQLite via `node:sqlite`, read all `nodes` and `workflows`, insert them into Postgres under the given `userId` via the Postgres stores. Idempotent: skip rows whose node id already exists for that user.

- [ ] **Step 2:** Test against a temp SQLite fixture with 3 nodes → assert 3 rows land under the user, and a second run inserts nothing.

- [ ] **Step 3: Commit.** `git commit -m "feat: one-off sqlite-to-postgres import script"`

### Task 12: Tenant-isolation tests, wiring, docs, green suite

**Files:**
- Create: `src/http/isolation.test.ts`
- Modify: `src/main.ts`, `docs/usage.md`, delete `src/storage/sqlite*.ts`

- [ ] **Step 1: Cross-tenant isolation tests at the HTTP boundary** — seed user-a with a tree and a token, user-b with a token. Assert: b's token on `/mcp get_tree treeId=keeperlog` cannot read a's nodes; b's token on the roots endpoint returns only b's data; b cannot mutate a's node via `update_node`/`delete_node` (returns "unknown node id", not a's row). This is the security gate of the whole sub-project.

- [ ] **Step 2: Wire `main.ts`** — `createDb`, build the Postgres stores, build the Fastify server with all routes, listen. Remove the old SQLite repos and delete `src/storage/sqlite.ts` + `sqlite-workflows.ts`.

- [ ] **Step 3: Update `docs/usage.md`** — the new connect flow: log in at `PUBLIC_URL`, generate a token, put it in `.mcp.json` and the hook config (replacing the old `HEARTWOOD_TOKEN`). Update `.claude/settings.local.json` example.

- [ ] **Step 4: Run the entire suite** (`pnpm test`, `pnpm typecheck`) with Postgres up. Expected: all green, including isolation.

- [ ] **Step 5: Final commit + push the branch.**
```bash
git add -A && git commit -m "feat: tenant-isolation tests, postgres wiring, updated docs"
git push -u origin feature/multi-tenant-backend
```

---

## Self-Review

**Spec coverage:** schema → Task 2; identities-for-three → Task 2 (github used in Task 8); `(userId,treeId)` namespace → Tasks 3/4; Postgres+Drizzle → Tasks 1/2/4; Fastify → Task 7; two auth paths → token (6/7) + session/OAuth (8); API surface → Tasks 7/8/9; standalone login+token page → Task 10; existing-data import → Task 11; tenant-isolation tests → Tasks 3/4/12; "core untouched" → Tasks 3/5 keep core signatures. No spec section is unmapped.

**Placeholders:** none — every code step shows code; CRUD bodies specify exact fields and the never-expose-hash rule.

**Type consistency:** `TreeStore.forUser` / `TreeRepository` used identically in Tasks 3, 4, 5, 7. `generateToken` shape (`raw`/`hash`/`prefix`) consistent across Tasks 6, 9. `McpDeps.trees` (bound) consistent in Tasks 5 and 7. `findOrCreateGithubUser` returns `userId`, consumed in Task 8 Step 3.
