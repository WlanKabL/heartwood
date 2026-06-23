import type { TreeRepository } from './repository.js'
import type { ResolvedNode, TreeNode } from './types.js'
import { resolveSubtree, buildTree, ageDaysBetween } from './tree.js'
import { computeHardness } from './hardness.js'

/**
 * Returned INSTEAD of performing a change when a protected (or load-bearing) node is
 * touched without `confirm: true`. The agent shows this to the human; the human re-runs
 * with confirm. The friction is the feature: the server decides what is hard, the human
 * decides whether to break it.
 */
export interface CascadePreview {
  requiresConfirmation: true
  reason: string
  affected: Array<{ id: string; label: string; effectiveHardness: number }>
}

const flattenChildren = (node: ResolvedNode): ResolvedNode[] =>
  node.children.flatMap((child) => [child, ...flattenChildren(child)])

const preview = (reason: string, affected: ResolvedNode[]): CascadePreview => ({
  requiresConfirmation: true,
  reason: `${reason}. Re-run with confirm: true to proceed.`,
  affected: affected.map((n) => ({ id: n.id, label: n.label, effectiveHardness: n.effectiveHardness })),
})

const requireNode = (nodes: TreeNode[], treeId: string, nodeId: string): TreeNode => {
  const target = nodes.find((n) => n.id === nodeId)
  if (!target) throw new Error(`node ${nodeId} not found in tree ${treeId}`)
  return target
}

export interface UpdateNodeInput {
  treeId: string
  nodeId: string
  content?: string
  label?: string
  hardnessSet?: number | null
  confirm?: boolean
}

export interface UpdateNodeResult {
  node: ResolvedNode
  /** Present only when the proposed hardnessSet was clamped by structural constraints. */
  hardnessNote?: string
}

/** Builds a plain-language note when a hardnessSet proposal was clamped. */
const buildHardnessNote = (proposed: number, applied: number, clamp: 'raised-to-floor' | 'lowered-to-ceiling'): string => {
  if (clamp === 'raised-to-floor') {
    return `hardness set ${proposed} → ${applied}: a root is structurally hard, so it was raised.`
  }
  return `hardness set ${proposed} → ${applied}: this node is structurally light; hang it higher if it should be load-bearing.`
}

/** Edits a node's content, label or proposed hardness. Protected nodes need confirm. */
export const updateNode = async (
  repo: TreeRepository,
  input: UpdateNodeInput,
  now: Date,
): Promise<UpdateNodeResult | CascadePreview> => {
  const existing = await repo.listNodes(input.treeId)
  const target = requireNode(existing, input.treeId, input.nodeId)
  const resolved = resolveSubtree(existing, input.nodeId, now)

  if (resolved.protected && input.confirm !== true) {
    return preview('updating a protected truth', flattenChildren(resolved))
  }

  const contentChanged = input.content !== undefined && input.content !== target.content
  const labelChanged = input.label !== undefined && input.label !== target.label
  const stamp = now.toISOString()
  const updated: TreeNode = {
    ...target,
    content: input.content ?? target.content,
    label: input.label ?? target.label,
    hardnessSet: input.hardnessSet !== undefined ? input.hardnessSet : target.hardnessSet,
    updatedAt: stamp,
    // A content/label edit resets the "proven" clock; a hardness nudge alone does not.
    lastConfirmedAt: contentChanged || labelChanged ? stamp : target.lastConfirmedAt,
  }
  await repo.updateNode(updated)

  const allNodes = existing.map((n) => (n.id === updated.id ? updated : n))
  const resolvedNode = resolveSubtree(allNodes, updated.id, now)

  let hardnessNote: string | undefined
  const proposedSet = input.hardnessSet !== undefined ? input.hardnessSet : null
  if (proposedSet != null) {
    const index = buildTree(allNodes)
    const depthFromRoot = index.depth.get(updated.id) ?? 0
    const descendantWeight = index.descendantWeight.get(updated.id) ?? 0
    const result = computeHardness({
      depthFromRoot,
      descendantWeight,
      hardnessSet: proposedSet,
      ageDays: ageDaysBetween(updated.lastConfirmedAt, now),
    })
    if (result.clamp !== 'none' && result.proposed !== null) {
      const roundedApplied = Math.round(result.applied * 10) / 10
      hardnessNote = buildHardnessNote(result.proposed, roundedApplied, result.clamp)
    }
  }

  return { node: resolvedNode, hardnessNote }
}

export interface MoveNodeInput {
  treeId: string
  nodeId: string
  newParentId: string | null
  confirm?: boolean
}

/** Re-hangs a node under a new parent (or null for a root). Rejects cycles; protected needs confirm. */
export const moveNode = async (
  repo: TreeRepository,
  input: MoveNodeInput,
  now: Date,
): Promise<ResolvedNode | CascadePreview> => {
  const existing = await repo.listNodes(input.treeId)
  const target = requireNode(existing, input.treeId, input.nodeId)
  const resolved = resolveSubtree(existing, input.nodeId, now)
  const descendants = flattenChildren(resolved)

  if (input.newParentId !== null) {
    if (!existing.some((n) => n.id === input.newParentId)) {
      throw new Error(`new parent ${input.newParentId} not found in tree ${input.treeId}`)
    }
    if (input.newParentId === input.nodeId || descendants.some((d) => d.id === input.newParentId)) {
      throw new Error('cannot move a node under itself or one of its descendants')
    }
  }

  if (resolved.protected && input.confirm !== true) {
    return preview('moving a protected truth', descendants)
  }

  const moved: TreeNode = { ...target, parentId: input.newParentId, updatedAt: now.toISOString() }
  await repo.updateNode(moved)
  return resolveSubtree(
    existing.map((n) => (n.id === moved.id ? moved : n)),
    moved.id,
    now,
  )
}

export interface DeleteNodeInput {
  treeId: string
  nodeId: string
  confirm?: boolean
}

export interface DeleteResult {
  deleted: string[]
}

/** Deletes a node and its descendants. Needs confirm if protected or it has descendants. */
export const deleteNode = async (
  repo: TreeRepository,
  input: DeleteNodeInput,
  now: Date,
): Promise<DeleteResult | CascadePreview> => {
  const existing = await repo.listNodes(input.treeId)
  requireNode(existing, input.treeId, input.nodeId)
  const resolved = resolveSubtree(existing, input.nodeId, now)
  const descendants = flattenChildren(resolved)

  if ((resolved.protected || descendants.length > 0) && input.confirm !== true) {
    return preview('deleting removes this node and its descendants', [resolved, ...descendants])
  }

  const ids = [input.nodeId, ...descendants.map((d) => d.id)]
  for (const id of ids) await repo.deleteNode(id)
  return { deleted: ids }
}
