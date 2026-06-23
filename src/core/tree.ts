import type { TreeNode, ResolvedNode } from './types.js'
import { computeHardness, PROTECTION_THRESHOLD } from './hardness.js'

const MS_PER_DAY = 86_400_000

/** Days between a confirmation timestamp and a reference time. Time is injected for determinism. */
export const ageDaysBetween = (lastConfirmedAt: string, now: Date): number => {
  const delta = now.getTime() - new Date(lastConfirmedAt).getTime()
  return Math.max(0, delta / MS_PER_DAY)
}

interface TreeIndex {
  nodes: Map<string, TreeNode>
  childrenOf: Map<string, TreeNode[]>
  rootIds: string[]
  depth: Map<string, number>
  descendantWeight: Map<string, number>
}

/**
 * Indexes a flat node list into a forest: resolves parent/child links, computes depth
 * from each root and load-bearing descendant weight. A tree may have several roots.
 * Throws on structural defects (duplicate id, missing parent, cycle, disconnected node).
 */
export const buildTree = (nodes: TreeNode[]): TreeIndex => {
  const byId = new Map<string, TreeNode>()
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`duplicate node id: ${node.id}`)
    byId.set(node.id, node)
  }

  const childrenOf = new Map<string, TreeNode[]>()
  const roots: TreeNode[] = []
  for (const node of nodes) {
    if (node.parentId === null) {
      roots.push(node)
      continue
    }
    if (!byId.has(node.parentId)) {
      throw new Error(`node ${node.id} references missing parent ${node.parentId}`)
    }
    const siblings = childrenOf.get(node.parentId) ?? []
    siblings.push(node)
    childrenOf.set(node.parentId, siblings)
  }

  const depth = new Map<string, number>()
  const descendantWeight = new Map<string, number>()
  if (nodes.length === 0) {
    return { nodes: byId, childrenOf, rootIds: [], depth, descendantWeight }
  }

  // BFS from every root (each root is depth 0). Detects cycles and disconnected nodes.
  const visited = new Set<string>()
  const queue: Array<{ id: string; d: number }> = roots.map((root) => ({ id: root.id, d: 0 }))
  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    if (visited.has(id)) throw new Error(`cycle detected at node ${id}`)
    visited.add(id)
    depth.set(id, d)
    for (const child of childrenOf.get(id) ?? []) {
      queue.push({ id: child.id, d: d + 1 })
    }
  }
  if (visited.size !== nodes.length) {
    throw new Error('tree is disconnected: some nodes are unreachable from any root')
  }

  const weightOf = (id: string): number => {
    let total = 0
    for (const child of childrenOf.get(id) ?? []) total += 1 + weightOf(child.id)
    descendantWeight.set(id, total)
    return total
  }
  for (const root of roots) weightOf(root.id)

  return { nodes: byId, childrenOf, rootIds: roots.map((root) => root.id), depth, descendantWeight }
}

const resolveFromIndex = (index: TreeIndex, nodeId: string, now: Date): ResolvedNode => {
  const node = index.nodes.get(nodeId)
  if (!node) throw new Error(`unknown node: ${nodeId}`)
  const depthFromRoot = index.depth.get(nodeId) ?? 0
  const descendantWeight = index.descendantWeight.get(nodeId) ?? 0
  const { effectiveHardness } = computeHardness({
    depthFromRoot,
    descendantWeight,
    hardnessSet: node.hardnessSet,
    ageDays: ageDaysBetween(node.lastConfirmedAt, now),
  })
  const children = (index.childrenOf.get(nodeId) ?? []).map((child) =>
    resolveFromIndex(index, child.id, now),
  )
  return {
    id: node.id,
    treeId: node.treeId,
    parentId: node.parentId,
    label: node.label,
    content: node.content,
    status: node.status,
    depthFromRoot,
    descendantWeight,
    effectiveHardness,
    protected: effectiveHardness >= PROTECTION_THRESHOLD,
    children,
  }
}

/** Resolves the whole forest into enriched, nested roots. Empty input returns []. */
export const resolveTree = (nodes: TreeNode[], now: Date): ResolvedNode[] => {
  const index = buildTree(nodes)
  return index.rootIds.map((id) => resolveFromIndex(index, id, now))
}

/** Resolves a single node and its descendants. */
export const resolveSubtree = (nodes: TreeNode[], nodeId: string, now: Date): ResolvedNode => {
  return resolveFromIndex(buildTree(nodes), nodeId, now)
}
