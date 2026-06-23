import { randomUUID } from 'node:crypto'
import type { TreeRepository } from './repository.js'
import type { ResolvedNode, TreeNode } from './types.js'
import { resolveSubtree } from './tree.js'

export interface CreateNodeInput {
  treeId: string
  parentId: string | null // null = create the root
  label: string
  content: string
  hardnessSet?: number | null // a proposal; the server clamps it to the structural band
}

/**
 * Adds a truth to a tree. Validates placement (one root per tree, parent must exist),
 * generates id and timestamps, persists, and returns the resolved node with its
 * server-computed hardness. A proposed hardness never decides the result; position does.
 */
export const createNode = async (
  repo: TreeRepository,
  input: CreateNodeInput,
  now: Date,
): Promise<ResolvedNode> => {
  const existing = await repo.listNodes(input.treeId)

  if (input.parentId === null) {
    if (existing.some((node) => node.parentId === null)) {
      throw new Error(`tree ${input.treeId} already has a root`)
    }
  } else if (!existing.some((node) => node.id === input.parentId)) {
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

  // Resolve within the full tree so depth and load-bearing weight are correct.
  return resolveSubtree([...existing, node], node.id, now)
}
