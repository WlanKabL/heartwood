import { randomUUID } from 'node:crypto'
import type { TreeRepository } from './repository.js'
import type { ResolvedNode, TreeNode } from './types.js'
import { resolveSubtree } from './tree.js'
import { computeHardness } from './hardness.js'
import { ageDaysBetween, buildTree } from './tree.js'
import { detectVolatility } from './volatility.js'

export interface CreateNodeInput {
  treeId: string
  parentId: string | null // null = create a root (several roots are allowed)
  label: string
  content: string
  hardnessSet?: number | null // a proposal; the server clamps it to the structural band
}

export interface CreateNodeResult {
  node: ResolvedNode
  /** Present only when the proposed hardnessSet was clamped by structural constraints. */
  hardnessNote?: string
  /** Advisory: present when the content looks like it may become stale (price, date, version, etc.). The node is always created regardless. */
  volatilityWarning?: string
  /** Advisory: present when an existing node in the same tree has a similar label. The node is always created regardless. */
  similarTo?: { id: string; label: string }
}

/** Builds a plain-language note when a hardnessSet proposal was clamped. */
const buildHardnessNote = (proposed: number, applied: number, clamp: 'raised-to-floor' | 'lowered-to-ceiling'): string => {
  if (clamp === 'raised-to-floor') {
    return `hardness set ${proposed} → ${applied}: a root is structurally hard, so it was raised.`
  }
  return `hardness set ${proposed} → ${applied}: this node is structurally light; hang it higher if it should be load-bearing.`
}

/**
 * Adds a truth to a tree. Validates that a non-null parent exists, generates id and
 * timestamps, persists, and returns the resolved node with its server-computed hardness.
 * A proposed hardness never decides the result; position does.
 *
 * When the proposed hardnessSet was clamped, hardnessNote explains what happened in plain language.
 */
export const createNode = async (
  repo: TreeRepository,
  input: CreateNodeInput,
  now: Date,
): Promise<CreateNodeResult> => {
  const existing = await repo.listNodes(input.treeId)

  if (input.parentId !== null && !existing.some((node) => node.id === input.parentId)) {
    throw new Error(`parent ${input.parentId} not found in tree ${input.treeId}`)
  }

  const stamp = now.toISOString()
  const node: TreeNode = {
    id: randomUUID(),
    treeId: input.treeId,
    parentId: input.parentId,
    label: input.label,
    content: input.content,
    hardnessSet: input.hardnessSet ?? null,
    status: 'active',
    createdAt: stamp,
    updatedAt: stamp,
    lastConfirmedAt: stamp,
  }
  await repo.insertNode(node)

  const allNodes = [...existing, node]

  // Resolve within the full tree so depth and load-bearing weight are correct.
  const resolvedNode = resolveSubtree(allNodes, node.id, now)

  let hardnessNote: string | undefined
  if (input.hardnessSet != null) {
    // Recompute with full tree topology to get clamp metadata.
    const index = buildTree(allNodes)
    const depthFromRoot = index.depth.get(node.id) ?? 0
    const descendantWeight = index.descendantWeight.get(node.id) ?? 0
    const result = computeHardness({
      depthFromRoot,
      descendantWeight,
      hardnessSet: input.hardnessSet,
      ageDays: ageDaysBetween(node.lastConfirmedAt, now),
    })
    if (result.clamp !== 'none' && result.proposed !== null) {
      const roundedApplied = Math.round(result.applied * 10) / 10
      hardnessNote = buildHardnessNote(result.proposed, roundedApplied, result.clamp)
    }
  }

  // Advisory: flag content that is likely to go stale.
  const volatilityWarning = detectVolatility(input.content) ?? undefined

  // Advisory: look for existing nodes whose label shares salient words with the new one.
  const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'been', 'they', 'their', 'your', 'what'])
  const salientWords = input.label
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))

  let similarTo: { id: string; label: string } | undefined
  if (salientWords.length > 0) {
    // Track how many salient words each candidate node matches.
    const scores = new Map<string, { node: TreeNode; count: number }>()
    for (const word of salientWords) {
      const matches = await repo.searchNodes(input.treeId, word)
      for (const candidate of matches) {
        if (candidate.id === node.id) continue // skip the node we just created
        const entry = scores.get(candidate.id)
        if (entry) {
          entry.count++
        } else {
          scores.set(candidate.id, { node: candidate, count: 1 })
        }
      }
    }
    // Pick the best-matching candidate.
    let best: { node: TreeNode; count: number } | undefined
    for (const entry of scores.values()) {
      if (!best || entry.count > best.count) best = entry
    }
    if (best) {
      similarTo = { id: best.node.id, label: best.node.label }
    }
  }

  return { node: resolvedNode, hardnessNote, volatilityWarning, similarTo }
}
