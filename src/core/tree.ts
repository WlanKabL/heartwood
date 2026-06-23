import type { TreeNode, ResolvedNode } from './types.js'
import { computeHardness } from './hardness.js'

const MS_PER_DAY = 86_400_000

/** Days between a confirmation timestamp and a reference time. Time is injected for determinism. */
export const ageDaysBetween = (lastConfirmedAt: string, now: Date): number => {
  const delta = now.getTime() - new Date(lastConfirmedAt).getTime()
  return Math.max(0, delta / MS_PER_DAY)
}

interface TreeIndex {
  nodes: Map<string, TreeNode>
  childrenOf: Map<string, TreeNode[]>
  rootId: string | null
  depth: Map<string, number>
  descendantWeight: Map<string, number>
}

/**
 * Indexes a flat node list into a tree: resolves parent/child links, computes depth
 * from the root and load-bearing descendant weight. Throws on structural defects
 * (duplicate id, missing parent, not exactly one root, cycle, disconnected node).
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

  if (nodes.length === 0) {
    return { nodes: byId, childrenOf, rootId: null, depth: new Map(), descendantWeight: new Map() }
  }
  if (roots.length !== 1) {
    throw new Error(`a tree must have exactly one root, found ${roots.length}`)
  }

  const root = roots[0]!
  const depth = new Map<string, number>()
  const visited = new Set<string>()
  const queue: Array<{ id: string; d: number }> = [{ id: root.id, d: 0 }]
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
    throw new Error('tree is disconnected: some nodes are unreachable from the root')
  }

  const descendantWeight = new Map<string, number>()
  const weightOf = (id: string): number => {
    let total = 0
    for (const child of childrenOf.get(id) ?? []) total += 1 + weightOf(child.id)
    descendantWeight.set(id, total)
    return total
  }
  weightOf(root.id)

  return { nodes: byId, childrenOf, rootId: root.id, depth, descendantWeight }
}

const resolveFromIndex = (index: TreeIndex, nodeId: string, now: Date): ResolvedNode => {
  const node = index.nodes.get(nodeId)
  if (!node) throw new Error(`unknown node: ${nodeId}`)
  const depthFromRoot = index.depth.get(nodeId) ?? 0
  const descendantWeight = index.descendantWeight.get(nodeId) ?? 0
  const { effectiveHardness, band } = computeHardness({
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
    band,
    children,
  }
}

/** Resolves the whole tree into the enriched, nested view. Returns null for an empty tree. */
export const resolveTree = (nodes: TreeNode[], now: Date): ResolvedNode | null => {
  const index = buildTree(nodes)
  if (index.rootId === null) return null
  return resolveFromIndex(index, index.rootId, now)
}

/** Resolves a single node and its descendants. */
export const resolveSubtree = (nodes: TreeNode[], nodeId: string, now: Date): ResolvedNode => {
  return resolveFromIndex(buildTree(nodes), nodeId, now)
}
