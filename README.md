# Heartwood

> Hardened, hierarchical project truth for AI agents.

Heartwood is a service that stores what a project (or person, or company) **actually is** as a tree of truths, and serves that tree to AI agents across any runtime. The deeper a truth sits in the tree, the harder it is for a passing prompt to bend it. Tell an agent "KeeperLog is hospital software" and the root pushes back instead of going along.

The name is the model: heartwood is the innermost, oldest part of a tree. Outer rings harden inward over years, and that dead, hard core carries the whole trunk. Here too: age becomes hardness, the core bears everything, layers harden over time.

---

## The problem it solves

An AI agent has no durable model of your project. Every task, it re-guesses what the thing is, who it's for, how it sounds. The knowledge exists, but it's scattered across docs, config, chat history and your head, and nothing guarantees the agent loads the right piece. Worse, the knowledge that gets created during a session evaporates after it. Features drift. Marketing comes out different every time. You hope the agent identifies the project correctly, and sometimes it doesn't.

Heartwood makes that knowledge **structured, persistent, authoritative and runtime-agnostic.**

---

## The model

A project's truth is a tree:

- **Roots** — the few unchangeable truths (what this fundamentally is). Highest authority, slowest to change.
- **Trunk** — direction, brand, positioning.
- **Branches** — features and capabilities.
- **Leaves** — concrete details, volatile, cheap to change.

**Depth is a single axis on which four things coincide.** The deeper a node:

- the more **authoritative** it is against a prompt (it resists, instead of complying),
- the more **stable** it is over time (it rarely changes),
- the more **expensive** it is to change (explicit YES plus cascade re-evaluation),
- the more **immutable** it is in day-to-day work.

Placement rule of thumb: *"how often does this honestly change?"* Never → root. Every sprint → leaf.

### Hardness

A node's hardness is the **maximum** of three sources:

- **set** — assigned explicitly by a human (roots are constitutional),
- **structural** — how much builds on top of it (load-bearing: the branch holds the leaves),
- **proven** — how long it has stood unchanged and confirmed (age as trust).

### The iron rule: AI proposes, server enforces

Hardness is computed and stored **server-side** and is authoritative at read time. An AI may *propose* hardness or placement for **new** nodes; it can never re-rate the hardness of existing nodes at runtime. Otherwise a clever prompt talks the agent into treating a root as soft, and the whole protection collapses. The server, not the prompt, decides what is hard.

Changing a hard node is blocked until a human confirms **with the cascade shown** ("this invalidates these 12 children, confirm"). The friction is the feature, not the bug. The most dangerous person who can say YES is the solo founder at 2am, so the system makes them look at what they're about to break.

---

## Design principles

- **The engine is universal, the positioning is narrow.** The tree carries anything (people, personas, companies, business models). It ships pointed at one sharp use case (project identity for AI agents). Build broad, tell it narrow.
- **A passive `AGENTS.md` is a document an agent *may* read. Heartwood is a service that *enforces*.** Active resistance plus a validation gate, retrievable across runtimes. That distinction is the reason it exists.
- **Workflows are an application, not the core.** The core is tree plus retrieval plus hardness. Workflows (e.g. "plan a feature") come on top as the first demo of value.

---

## Non-goals

- Not a revenue product. Portfolio plus self-use. No billing, no growth story.
- Not an agent runtime. It layers on top of existing runtimes (Claude Code, OpenClaw, etc.).
- Not a methodology/prompt pack. That field is mature and unmonetizable; this is the knowledge layer underneath it.

---

## Status

**Live in production** at <https://heartwood.wlankabl.com>. The core through multi-tenant and workflows is built, tested and deployed:

- **Truth engine** — server-computed hardness, the iron rule enforced at read time, write-governance (protected nodes need a cascade-confirmed YES before they change).
- **Multi-tenant** — Postgres (Drizzle), GitHub-OAuth login, per-account API tokens, tenant-scoped trees. One token only ever sees its owner's forest.
- **HTTP MCP server** — Streamable HTTP at `/mcp`, bearer-token auth, plus a SessionStart hook that auto-loads a tree's protected core into a chat.
- **Workflows** — `build_guide` and `check_consistency` built in, plus user-defined ones via `define_workflow`.
- **Frontend + deploy** — Nuxt account/token UI, prebuilt GHCR images, GitHub-Actions deploy with healthcheck and rollback behind host nginx + certbot.

The first dogfood tree is Heartwood's own identity, authored through the tool itself. See [docs/usage.md](docs/usage.md) to connect it to Claude Code, or [docs/self-hosting.md](docs/self-hosting.md) to run your own instance.

What is **not** done yet is Phase 5 (opening up): an OSS release, an install path for others, and optional public/shared trees. See [ROADMAP.md](ROADMAP.md).
