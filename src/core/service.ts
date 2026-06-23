import type { TreeRepository } from './repository.js'
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
