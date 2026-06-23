import type { TreeRepository, TreeSummary } from './repository.js'
import type { ResolvedNode } from './types.js'
import { resolveTree, resolveSubtree } from './tree.js'

/**
 * Use-cases that join storage with the engine. The repository supplies the flat node
 * list; the (synchronous, pure) engine turns it into the resolved, hardness-enriched
 * forest. `now` is injected so resolution stays deterministic and testable.
 */

export const getResolvedTree = async (
  repo: TreeRepository,
  treeId: string,
  now: Date,
): Promise<ResolvedNode[]> => {
  return resolveTree(await repo.listNodes(treeId), now)
}

export const getResolvedSubtree = async (
  repo: TreeRepository,
  treeId: string,
  nodeId: string,
  now: Date,
): Promise<ResolvedNode> => {
  return resolveSubtree(await repo.listNodes(treeId), nodeId, now)
}

export const listTreeSummaries = async (repo: TreeRepository): Promise<TreeSummary[]> => {
  return repo.listTreeSummaries()
}

export const deleteTree = async (repo: TreeRepository, treeId: string): Promise<number> => {
  return repo.deleteTree(treeId)
}

/**
 * Search for nodes matching `query` in one tree, then resolve the full tree so
 * effectiveHardness is correct for every hit. Returns matching nodes as flat resolved
 * nodes (children cleared so the shape matches what get_tree returns per node).
 */
export const searchTruths = async (
  repo: TreeRepository,
  treeId: string,
  query: string,
  now: Date,
): Promise<ResolvedNode[]> => {
  const matchedNodes = await repo.searchNodes(treeId, query)
  if (matchedNodes.length === 0) return []

  const matchedIds = new Set(matchedNodes.map((n) => n.id))
  const resolved = resolveTree(await repo.listNodes(treeId), now)

  const flatten = (node: ResolvedNode): ResolvedNode[] => [node, ...node.children.flatMap(flatten)]
  return resolved
    .flatMap(flatten)
    .filter((n) => matchedIds.has(n.id))
    .map((n) => ({ ...n, children: [] }))
}

const flatten = (node: ResolvedNode): ResolvedNode[] => [node, ...node.children.flatMap(flatten)]

/**
 * The protected core of a tree as a flat list: every node marked protected. This is
 * what a session hook loads first, as authoritative truth.
 */
export const getProtectedNodes = async (
  repo: TreeRepository,
  treeId: string,
  now: Date,
): Promise<ResolvedNode[]> => {
  return resolveTree(await repo.listNodes(treeId), now)
    .flatMap(flatten)
    .filter((node) => node.protected)
    .map((node) => ({ ...node, children: [] }))
}
