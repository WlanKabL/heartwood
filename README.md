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

Phase 1 in progress. The core engine, storage and a local HTTP MCP server with bearer-token auth are built and tested (58 tests). See [docs/usage.md](docs/usage.md) to run it and connect it to Claude Code, and [ROADMAP.md](ROADMAP.md) for what is next.
