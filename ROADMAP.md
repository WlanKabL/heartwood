# Heartwood — Roadmap

> MVP-first. Each phase ships something usable on its own. The vision (multi-tenant, worldwide, workflows) is staged *after* a working core, never before it. No half-finished foundation.

The guiding constraint: **the fastest path to "KeeperLog and ZentraX move faster" is a small core soon, not the full vision late.**

---

## Where this stands (2026-06-24)

**Phases 0 through 4 are shipped. Heartwood is live in production** at <https://heartwood.wlankabl.com>: multi-tenant, Postgres-backed, GitHub login, per-account tokens, the write-governance engine, the SessionStart hook, workflows, a Nuxt frontend, and a GitHub-Actions deploy with rollback. The first dogfood tree is Heartwood's own identity, authored through the tool. **Only Phase 5 (opening up) is still open.** Each phase below carries its status; this is history plus what remains, not a list of unbuilt work.

---

## Phase 0 — Foundations (concept + data model) ✅ shipped

Decide and write down before any feature code:

- **Node schema** — id, parent, type, content, depth, hardness fields (set / structural / proven), timestamps.
- **Hardness computation** — exact formula for `max(set, structural, proven)`, how structural is derived from the dependency count, how proven accrues with age.
- **Read API shape** — fetch a subtree, fetch by scope, follow branches. JSON, nested.
- **Tech-stack decision** (see open questions below).

**Deliverable:** a short design spec in `docs/`. No code yet.

---

## Phase 1 — Single-user core (the MVP slice) ✅ shipped

The smallest thing that solves the real pain and proves the tree thesis.

- Tree store (SQLite to start).
- Read API + an MCP server that exposes it.
- Server-side hardness computation, authoritative at read time.
- A load hook so an agent pulls the tree at the start of a task.
- **One account (you), simple token auth, no multi-tenant.**
- **KeeperLog as the first real tree**, seeded from `docs/strategy/product-identity.md`.

**Goal:** "Claude loses KeeperLog's context" stops being true. Dogfood it daily.

---

## Phase 2 — Write path + governance ✅ shipped

- AI *proposes* new nodes during work; human confirms content, placement and hardness.
- Changing a hard node is blocked → cascade preview → explicit human YES.
- **Validation gate:** check a planned output against the roots before it ships; flag violations.

**Goal:** the capture loop closes. Knowledge stops evaporating between sessions.

---

## Phase 3 — Multi-tenant ✅ shipped

- Real accounts, multiple projects per account, proper auth.
- MCP/hook registers and logs in against an account (the model from the original sketch).
- **ZentraX as the second tree**, to prove the engine is genuinely project-agnostic.

**Goal:** more than one project, more than one user, hosted on own server.

---

## Phase 4 — Workflows ✅ shipped (generic mechanism)

- Shipped as a **generic workflow mechanism** rather than a single hardcoded "plan a feature": `build_guide` and `check_consistency` are built in, and `define_workflow` / `run_workflow` let any tree carry its own templates with `{{truths}}` and `{{input}}` placeholders. The same engine serves a developer's `plan_feature`, a company's `draft_okr`, a person's `write_message`.
- This is the original pain solved end-to-end: an output can be checked against the roots before it ships, so it can no longer drift from what the project is.

**Goal:** show the tree's value as a live workflow, not just storage. Done.

---

## Phase 5 — Opening up ⏳ open (the only remaining phase)

- OSS release, docs, install path (format + reference server + hosted MCP endpoint).
- Optional: public/shared trees for known entities.
- "For AI agents worldwide."

**Goal:** reputation and top-of-funnel for the main projects. Distribution, not revenue.

---

## Technical decisions (resolved)

- **Runtime:** Node + TypeScript (strict, ESM/NodeNext), Fastify for HTTP.
- **Storage:** Postgres via Drizzle. SQLite served the single-user phase; the import script (`src/scripts/import-sqlite.ts`) carried that data into Postgres at multi-tenant.
- **MCP transport:** hosted HTTP (Streamable HTTP at `/mcp`).
- **Auth:** GitHub-OAuth login for the browser, hashed `hw_` bearer tokens for MCP, every store bound to a `userId`.
- **Hosting:** own server, prebuilt GHCR images, host nginx + certbot, GitHub-Actions deploy with healthcheck and rollback.

---

## Relationship to the other projects

Heartwood is the tool. Its **own identity** is the first tree, authored through the tool itself. **KeeperLog** is the first real product tree and the proof; **ZentraX** is the next. If Heartwood doesn't visibly make those two move faster, it has failed its own thesis.
