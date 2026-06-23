# Heartwood — Architecture & Phase 0 Spec

> Technical design for the core. Concept lives in [../README.md](../README.md); build order in [../ROADMAP.md](../ROADMAP.md). This document is the Phase 0 deliverable: data model, hardness algorithm, API and layering, settled before feature code.

## Decisions (Phase 0)

- **Stack:** Node + TypeScript, SQLite (Phase 1) → Postgres (multi-tenant). MCP via the official `@modelcontextprotocol/sdk`.
- **One root per tree.** The root node is the project itself; core truths are its top-level children.
- **Protection threshold:** `effectiveHardness >= 60` marks a node as protected (change requires cascade preview + explicit human YES).

## Layering

Three layers, one direction of dependency. The core knows nothing about transports.

1. **Core** — tree engine, storage, hardness computation. Protocol-agnostic, fully unit-tested.
2. **MCP adapter** — thin facade exposing core operations as MCP tools (stdio in Phase 1).
3. **HTTP API** — same core, second entrance. Arrives with accounts (Phase 3).

Build the core once; hang any number of facades off it.

## Data model

```ts
interface TreeNode {
  id: string
  treeId: string
  parentId: string | null      // null = the single root of the tree
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

- `depthFromRoot` — distance to the root.
- `descendantWeight` — how much hangs below the node (load-bearing measure).
- `effectiveHardness` — see below.

## Hardness algorithm

Hardness is **not** `max()` of the three sources. A single high source (e.g. an AI proposing `hardnessSet = 100` for a QR-code leaf because it "feels important") must not win. **Structure is the backbone and the ceiling; `set` and `proven` may only modulate within the structurally allowed band.**

```
structuralBase = f(closenessToRoot, descendantWeight)   // 0–100, from topology, not promptable
ceiling = structuralBase + HEADROOM                     // proposed hardness can never break structure
floor   = structuralBase * FLOOR_FACTOR                 // load-bearing nodes don't fall below their weight
effectiveHardness = clamp( blend(structuralBase, proven, clamp(set, 0, ceiling)), floor, ceiling )
```

- `structuralBase` rises with closeness to the root **and** with `descendantWeight`. A node that carries a lot is hard regardless of any proposed number.
- `proven` rises with age since `lastConfirmedAt`. Confirmed-and-unchanged truths harden over time.
- `set` is a **proposal** (from a human or an AI). The server clamps it into `[0, ceiling]`. It can nudge, never override.

**Why position, not number.** A number is trivial for an AI to assert. Topology (where a node hangs, what hangs below it) is a structural fact a prompt cannot talk away. So the governance question is not "how hard is it" but "where may it hang", and the human answers that, not the prompt.

**Worked example (the QR bug case).** "QR handover" hangs as a branch under "animal record". `structuralBase ≈ 40`, so `ceiling ≈ 55`. An AI may propose `set = 100`; the server clamps it to 55. The backend keeps the upper hand because position is authoritative.

### Hardness bands (labels over the number)

| Band   | Range  | Meaning                          |
| ------ | ------ | -------------------------------- |
| Leaf   | 0–25   | volatile detail, cheap to change |
| Branch | 26–50  | feature / capability             |
| Trunk  | 51–75  | direction, brand, positioning    |
| Root   | 76–100 | constitutional truth             |

## Friction scales with depth (placement *and* change)

- Creating a **leaf** is frictionless. The AI may do it on its own.
- Placing or moving a node into a **hard position** (near the root) triggers confirmation, same as editing a protected node.
- Editing a node with `effectiveHardness >= 60`: blocked until cascade preview (which descendants this invalidates) plus explicit human YES.

This is the iron rule in practice: AI proposes, server enforces.

## Read API / MCP tools (Phase 1)

| Operation        | Shape                                  | Returns                          |
| ---------------- | -------------------------------------- | -------------------------------- |
| `get_tree`       | `{ treeId }`                           | full tree, nested JSON           |
| `get_subtree`    | `{ nodeId }`                           | subtree from a node              |
| `get_by_scope`   | `{ treeId, label }`                    | nodes matching a scope/label     |
| `get_roots`      | `{ treeId }`                           | the protected core, for the hook |

Each node in a response carries `content`, `effectiveHardness`, its band, and `children`.

## Deferred to later phases

- **Write path + governance** (propose node, cascade preview, root YES) — Phase 2.
- **Validation gate** (check a planned output against the roots) — Phase 2.
- **Accounts, multi-tenant, HTTP transport** — Phase 3.
