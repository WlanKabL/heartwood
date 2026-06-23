# Heartwood V2 — Write Lifecycle + Trust Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the gap an unbiased eval surfaced: Heartwood is "a good reading memory with a weak writing conscience." V2 fixes two real trust bugs, adds the missing discoverability/cleanup tools, and gives the write side a conscience (reminder, volatility warning, dedup hint).

**Architecture:** Same layered core (engine → MCP adapter → Fastify). All changes are additive: new repository methods + MCP tools, sharpened tool descriptions, a rounding pass on the hardness output, and a new Stop hook alongside the existing SessionStart hook. The protocol-agnostic core stays the source of hardness truth.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), Drizzle + Postgres, Fastify, vitest. Build on `main` (multi-tenant backend already merged).

**Context — the two eval reports:** an aggressive build test (the agent built keeperlog and the hardness mechanic + volatility guidance worked as designed) and an unbiased first-contact eval. Findings driving this plan:
- BUG: `create_node` description says hardness is only clamped down ("never exceed"), but there is also a FLOOR — a root with `hardnessSet: 20` was silently raised to 80. Misleading + silent.
- BUG: `effectiveHardness` prints full float (`64.50022972…`) and drifts every read (the `proven`/time factor), which reads as "same question, different answer" — bad for a trust tool.
- GAP: no `list_trees` (a fresh agent only learns treeIds from the hook), no `delete_tree` (sandbox ghosts), no search (50+ node trees get unbrowsable), no dedup/contradiction signal.
- GAP: writing has no trigger. Reading is solved by the SessionStart hook; new durable truths get entered only if the agent remembers. This is the likeliest drift path.

---

## Task 1: Trust — round hardness output, explain clamping, fix descriptions

**Files:**
- Modify: `src/core/hardness.ts` (surface clamp info), `src/core/types.ts` (`HardnessResult`), `src/core/tree.ts` (round on resolve)
- Modify: `src/core/create.ts` + `src/core/write.ts` (return a clamp note), `src/mcp/server.ts` (descriptions + pass note through)
- Test: the existing hardness/tree/create tests + new cases

- [ ] **Step 1:** Read `src/core/hardness.ts`, `types.ts`, `tree.ts`, `create.ts`, `write.ts`, `mcp/server.ts`. Note how `computeHardness` returns `HardnessResult` and how `resolveTree` sets `effectiveHardness`.

- [ ] **Step 2: Round the output.** In `resolveTree`/`resolveSubtree` (wherever `effectiveHardness` is assigned to a `ResolvedNode`), round to ONE decimal place: `Math.round(h * 10) / 10`. The internal computation stays full-precision; only the value exposed on `ResolvedNode` is rounded. This kills the per-read float drift while the real multi-day `proven` trend stays visible. Add a test asserting a resolved node's `effectiveHardness` has at most one decimal.

- [ ] **Step 3: Surface clamp info.** Extend `HardnessResult` with how the proposed `set` was treated: `clamp: 'none' | 'raised-to-floor' | 'lowered-to-ceiling'` plus the numbers (`proposed`, `applied`). `computeHardness` already knows `structuralBase`, `ceiling`, `floor`, `set` — set the field there. Test: a root proposing 20 → `raised-to-floor` with applied ≥ floor; a deep leaf proposing 100 → `lowered-to-ceiling`.

- [ ] **Step 4: Return a human note from create/update.** When a node is created/updated WITH a `hardnessSet` that got clamped, include a `hardnessNote` string in the returned object, e.g. `"hardness set 20 → 80: a root is structurally hard, the floor raised it"` or `"hardness set 78 → 56: this node is structurally light; hang it higher if it should be load-bearing"`. Only present when clamped. Keep the wording plain (no jargon like "ceiling"/"structuralBase" in user-facing text — translate to "structurally light/hard").

- [ ] **Step 5: Fix the descriptions.** In `mcp/server.ts`, correct the `create_node` description: a proposed `hardnessSet` is clamped into the structurally allowed band — it can be raised UP to a floor (roots are always hard) or lowered to a ceiling, it is never taken at face value. Add a one-line explanation of `label` vs `content`: label is a short title, content is the single truth itself. Mirror the band wording on `update_node`.

- [ ] **Step 6:** Run `pnpm test` + `pnpm typecheck` green. Commit `feat: round hardness output, explain clamping, fix create_node docs`.

## Task 2: Discoverability + cleanup tools (list_trees, delete_tree, search_truths)

**Files:**
- Modify: `src/core/repository.ts` (+ InMemory), `src/storage/postgres-trees.ts`, `src/core/service.ts`, `src/mcp/server.ts`
- Test: contract tests + MCP integration

- [ ] **Step 1: Repository methods (tenant-scoped, so they only ever see the bound user's data):**
  - `listTreeSummaries(): Promise<{ treeId: string; nodeCount: number }[]>`
  - `deleteTree(treeId: string): Promise<number>` (returns count removed)
  - `searchNodes(treeId: string, query: string): Promise<TreeNode[]>` (case-insensitive substring over label + content)
  Add to the `TreeRepository` interface, the InMemory bound repo, and the Postgres bound repo (Drizzle: `ilike`, `count`, scoped `delete`). Extend the contract suite for all three, including an isolation case (user B's `listTreeSummaries`/`searchNodes` never sees A's trees).

- [ ] **Step 2: `list_trees` tool** — no args beyond the implicit user; returns the summaries. Description: "List your trees and how many truths each holds. Use this first when you don't know which treeId to read."

- [ ] **Step 3: `delete_tree` tool** — args `{ treeId, confirm?: boolean }`. Without `confirm`, return a preview `{ requiresConfirmation: true, treeId, nodeCount }`; with `confirm: true`, delete and return `{ deleted: treeId, removed: n }`. Mirror the existing delete-node confirmation style.

- [ ] **Step 4: `search_truths` tool** — args `{ treeId, query }`; returns the matching resolved nodes (label, content, effectiveHardness, protected). Description: "Find truths in a tree by keyword, for when the tree is too big to read whole."

- [ ] **Step 5:** Tests for each tool through the MCP integration path (Postgres). Run `pnpm test` + `pnpm typecheck`. Commit `feat: list_trees, delete_tree, search_truths`.

## Task 3: Write conscience on create_node (volatility warning + dedup hint)

**Files:**
- Modify: `src/core/create.ts` (or a small `src/core/guard.ts` helper), `src/mcp/server.ts`
- Test: new unit tests

- [ ] **Step 1: Volatility heuristic.** A pure function `detectVolatility(content: string): string | null` flagging likely-ephemeral content: currency (`€`, `$`, `£` next to digits), percentages (`\d+\s*%`), explicit dates (`\d{4}-\d{2}-\d{2}`, `\d{1,2}\.\d{1,2}\.\d{4}`), version-like (`v?\d+\.\d+`). Returns a short warning string or null. Test each pattern + a clean string (returns null). It WARNS, never blocks — a truth like "three core capabilities" must pass clean.

- [ ] **Step 2: Wire it into create_node** — when `detectVolatility(content)` fires, attach a `volatilityWarning` to the returned object (alongside the created node), e.g. "This looks like it contains a changing figure (a price/percentage/date). Durable truths only — if this will be wrong in a few months, put it in a decision-record instead." The node is still created; the agent decides.

- [ ] **Step 3: Dedup hint.** On create, run `searchNodes(treeId, <salient words from label>)` (reuse Task 2). If a node with high overlap exists, attach a `similarTo` hint `{ id, label }` so the agent can dedupe. Keep it cheap (substring match on the label's significant words); no embeddings. Test: creating a near-duplicate surfaces the existing node; a distinct node does not.

- [ ] **Step 4:** Run `pnpm test` + `pnpm typecheck`. Commit `feat: volatility warning + dedup hint on create_node`.

## Task 4: Write trigger — Stop hook

**Files:**
- Create: `bin/stop-hook.mjs`
- Modify: `docs/usage.md` (document the Stop hook config)

- [ ] **Step 1: Confirm the mechanism.** Before writing, verify via the claude-code-guide agent (or docs) what a Claude Code Stop hook can do — specifically whether it can inject a non-blocking note into the session without forcing the agent to continue. Design for the LEAST intrusive option: a gentle reminder, not a gate. If a Stop hook can only block, prefer emitting a short reminder and exiting 0.

- [ ] **Step 2:** Write `bin/stop-hook.mjs` (plain Node, soft-fail like `bin/hook.mjs`): on session stop, emit ONE short line reminding to capture any new durable project truth into Heartwood (e.g. "If this session established a durable truth about the project, consider adding it to the Heartwood tree."). It must never block the stop on error and must stay quiet/minimal — this is a nudge, not a nag.

- [ ] **Step 3:** Document the Stop hook in `docs/usage.md` next to the SessionStart hook (the `.claude/settings.local.json` snippet). Note it is deliberately gentle and tunable.

- [ ] **Step 4:** Commit `feat: stop-hook nudge to capture durable truths`.

---

## Out of scope (deferred)
- Embedding-based semantic dedup (ILIKE first stage only).
- Hard volatility blocking (warning only — a block fights too many legitimate truths).
- The strategic ".md → Heartwood as single source" migration: that is step two, AFTER V2, once the write lifecycle is solid.

## Self-Review
Coverage: trust bugs → T1; missing tools → T2; weak write discipline → T3; no write trigger → T4. Descriptions corrected (T1.5). Tenant isolation preserved on every new repo method (T2.1). All notes/warnings are advisory, never blocking — the server keeps hardness authority, the agent keeps content authority.
