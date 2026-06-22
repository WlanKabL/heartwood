# Heartwood — Roadmap

> MVP-first. Each phase ships something usable on its own. The vision (multi-tenant, worldwide, workflows) is staged *after* a working core, never before it. No half-finished foundation.

The guiding constraint: **the fastest path to "KeeperLog and ZentraX move faster" is a small core soon, not the full vision late.**

---

## Phase 0 — Foundations (concept + data model)

Decide and write down before any feature code:

- **Node schema** — id, parent, type, content, depth, hardness fields (set / structural / proven), timestamps.
- **Hardness computation** — exact formula for `max(set, structural, proven)`, how structural is derived from the dependency count, how proven accrues with age.
- **Read API shape** — fetch a subtree, fetch by scope, follow branches. JSON, nested.
- **Tech-stack decision** (see open questions below).

**Deliverable:** a short design spec in `docs/`. No code yet.

---

## Phase 1 — Single-user core (the MVP slice)

The smallest thing that solves the real pain and proves the tree thesis.

- Tree store (SQLite to start).
- Read API + an MCP server that exposes it.
- Server-side hardness computation, authoritative at read time.
- A load hook so an agent pulls the tree at the start of a task.
- **One account (you), simple token auth, no multi-tenant.**
- **KeeperLog as the first real tree**, seeded from `docs/strategy/product-identity.md`.

**Goal:** "Claude loses KeeperLog's context" stops being true. Dogfood it daily.

---

## Phase 2 — Write path + governance

- AI *proposes* new nodes during work; human confirms content, placement and hardness.
- Changing a hard node is blocked → cascade preview → explicit human YES.
- **Validation gate:** check a planned output against the roots before it ships; flag violations.

**Goal:** the capture loop closes. Knowledge stops evaporating between sessions.

---

## Phase 3 — Multi-tenant

- Real accounts, multiple projects per account, proper auth.
- MCP/hook registers and logs in against an account (the model from the original sketch).
- **ZentraX as the second tree**, to prove the engine is genuinely project-agnostic.

**Goal:** more than one project, more than one user, hosted on own server.

---

## Phase 4 — Workflows

- First workflow application: **"plan a feature."** It loads the relevant subtree as context and writes the resulting decisions back as new nodes.
- This is the original pain solved end-to-end: a planned feature can no longer drift from what the project is.

**Goal:** show the tree's value as a live workflow, not just storage.

---

## Phase 5 — Opening up

- OSS release, docs, install path (format + reference server + hosted MCP endpoint).
- Optional: public/shared trees for known entities.
- "For AI agents worldwide."

**Goal:** reputation and top-of-funnel for the main projects. Distribution, not revenue.

---

## Open technical decisions (resolve in Phase 0)

- **Runtime:** Node + TypeScript is the likely default (matches existing stack, MCP SDK is TS-first). Confirm.
- **Storage:** SQLite for Phase 1 → Postgres at multi-tenant. Confirm.
- **MCP transport:** stdio (local) vs. hosted HTTP. Phase 1 can be local; hosted arrives with multi-tenant.
- **Auth:** single token (Phase 1) → account-based (Phase 3).
- **Hosting:** own server (per the sketch). Confirm which.

---

## Relationship to the other projects

Heartwood is the tool. **KeeperLog** is the first dogfood tree and the proof. **ZentraX** is the second tree. If Heartwood doesn't visibly make those two move faster, it has failed its own thesis.
