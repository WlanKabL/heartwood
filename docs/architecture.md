# Heartwood — Architecture & Phase 0 Spec

> Technical design for the core. Concept lives in [../README.md](../README.md); build order in [../ROADMAP.md](../ROADMAP.md). This document is the Phase 0 deliverable: data model, hardness algorithm, API and layering, settled before feature code.
>
> **Historical note (2026-06-24):** this is the original Phase 0 spec. Everything it stages as "Phase 2/3" is built and live now, and storage moved fully to Postgres (SQLite is gone). The data model, hardness algorithm and layering below are still accurate; only the "arrives later" framing is dated. Current status is in [../ROADMAP.md](../ROADMAP.md).

## Decisions

- **Stack:** Node + TypeScript, SQLite (Phase 1) → Postgres (multi-tenant). MCP via the official `@modelcontextprotocol/sdk`.
- **Several roots allowed (a forest).** A tree may have multiple top-level truths; not everything has to hang off one node. Each root is its own depth-0 strand.
- **Protection threshold:** `effectiveHardness >= 60` marks a node as protected (change requires cascade preview + explicit human YES).

## Layering

Three layers, one direction of dependency. The core knows nothing about transports.

1. **Core** — tree engine, storage, hardness computation. Protocol-agnostic, fully unit-tested.
2. **MCP adapter** — thin facade exposing core operations as MCP tools.
3. **HTTP API** — same core, second entrance. Arrives with accounts (Phase 3).

Build the core once; hang any number of facades off it.

## Data model

```ts
interface TreeNode {
  id: string
  treeId: string
  parentId: string | null      // null = a root of the tree (several roots allowed)
  label: string                // short name, e.g. "identity", "voice", "qr-handover"
  content: string              // the actual truth
  hardnessSet: number | null   // 0–100, human/AI *proposal*; null = derive only
  status: 'active' | 'deprecated'
  createdAt: string
  updatedAt: string
  lastConfirmedAt: string      // resets on edit; feeds "proven"
}
```

Derived, never trusted from the client, always computed server-side:

- `depthFromRoot` — distance to this node's root (0 = a root).
- `descendantWeight` — how much hangs below the node (load-bearing measure).
- `effectiveHardness` — see below.
- `protected` — `effectiveHardness >= 60`.

## Hardness algorithm

Hardness is **not** `max()` of the three sources. A single high source (e.g. an AI proposing `hardnessSet = 100` for a QR-code leaf because it "feels important") must not win. **Structure is the backbone and the ceiling; `set` and `proven` may only modulate within the structurally allowed band.**

```
structuralBase = f(closenessToRoot, descendantWeight)   // 0–100, from topology, not promptable
ceiling = structuralBase + HEADROOM                     // proposed hardness can never break structure
floor   = structuralBase * FLOOR_FACTOR                 // load-bearing nodes don't fall below their weight
effectiveHardness = clamp( blend(structuralBase, proven, clamp(set, 0, ceiling)), floor, ceiling )
```

- `structuralBase` rises with closeness to a root **and** with `descendantWeight`. A node that carries a lot is hard regardless of any proposed number.
- `proven` rises with age since `lastConfirmedAt`. Confirmed-and-unchanged truths harden over time.
- `set` is a **proposal** (from a human or an AI). The server clamps it into `[0, ceiling]`. It can nudge, never override.

**Why position, not number.** A number is trivial for an AI to assert. Topology (where a node hangs, what hangs below it) is a structural fact a prompt cannot talk away. So the governance question is not "how hard is it" but "where may it hang", and the human answers that, not the prompt.

**Worked example (the QR bug case).** "QR handover" hangs deep under "positioning". Its `structuralBase` is low, so its `ceiling` is low. An AI may propose `set = 100`; the server clamps it. The backend keeps the upper hand because position is authoritative.

### Hardness is a number, not a level label

There is deliberately **no** band label (leaf / branch / trunk / root). With several roots and load-bearing nodes, a depth-1 trunk can legitimately be harder than a shallow root, and a level label would lie. The structural level lives in `depthFromRoot`; how hard a truth is lives in `effectiveHardness` (0–100); the one actionable bit is `protected`. Position and hardness are related, not the same.

## Friction scales with depth (placement *and* change)

- Creating a deep, low-hardness node is frictionless. The AI may do it on its own.
- Placing or moving a node into a **hard position** (a root or near one) triggers confirmation, same as editing a protected node.
- Editing a node with `effectiveHardness >= 60`: blocked until cascade preview (which descendants this invalidates) plus explicit human YES.

This is the iron rule in practice: AI proposes, server enforces. (The change-side governance is Phase 2; create is open today.)

## MCP tools (Phase 1)

| Tool          | Shape                                                 | Returns                                |
| ------------- | ----------------------------------------------------- | -------------------------------------- |
| `get_roots`   | `{ treeId }`                                          | the protected core, flat, for the hook |
| `get_tree`    | `{ treeId }`                                          | the forest (list of roots), nested     |
| `get_subtree` | `{ treeId, nodeId }`                                  | one node and its descendants           |
| `create_node` | `{ treeId, parentId, label, content, hardnessSet? }`  | the created node, resolved             |

Each node in a response carries `content`, `depthFromRoot`, `effectiveHardness`, `protected`, and `children`.

## Deferred to later phases

- **Write-side governance** (edit/move guard, cascade preview, root YES) — Phase 2.
- **Validation gate** (check a planned output against the roots) — Phase 2.
- **Accounts, multi-tenant** — Phase 3.
- **Structure guidance / build methodology** (how to author a coherent tree: granularity, when a theme deserves its own root) — surfaced by dogfooding; belongs in a `get_guide` tool or an MCP prompt, not in tool descriptions.
