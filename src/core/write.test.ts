import { describe, it, expect } from 'vitest'
import type { TreeNode, ResolvedNode } from './types.js'
import { InMemoryTreeStore } from './repository.js'
import type { TreeRepository } from './repository.js'
import { updateNode, moveNode, deleteNode, type CascadePreview } from './write.js'

const STAMP = '2026-01-01T00:00:00.000Z'
const NOW = new Date(STAMP)

const node = (id: string, parentId: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  treeId: 't1',
  parentId,
  label: id,
  content: `content ${id}`,
  hardnessSet: null,
  status: 'active',
  createdAt: STAMP,
  updatedAt: STAMP,
  lastConfirmedAt: STAMP,
  ...extra,
})

// chain r -> a -> b -> c -> d -> e; 'r' is protected (depth 0), 'e' is a deep, unprotected leaf.
const chainRepo = async (): Promise<TreeRepository> => {
  const chain = ['r', 'a', 'b', 'c', 'd', 'e']
  const repo = new InMemoryTreeStore().forUser('test-user')
  for (const [i, id] of chain.entries()) await repo.insertNode(node(id, i === 0 ? null : chain[i - 1]!))
  return repo
}

const asNode = (r: ResolvedNode | CascadePreview): ResolvedNode => {
  if ('requiresConfirmation' in r) throw new Error('expected a node, got a confirmation preview')
  return r
}
const asPreview = (r: ResolvedNode | CascadePreview): CascadePreview => {
  if (!('requiresConfirmation' in r)) throw new Error('expected a confirmation preview')
  return r
}

describe('updateNode', () => {
  it('updates an unprotected node without friction', async () => {
    const repo = await chainRepo()
    const result = asNode(await updateNode(repo, { treeId: 't1', nodeId: 'e', content: 'new e' }, NOW))
    expect(result.content).toBe('new e')
  })

  it('returns a cascade preview for a protected node, without changing it', async () => {
    const repo = await chainRepo()
    const preview = asPreview(await updateNode(repo, { treeId: 't1', nodeId: 'r', content: 'hijack' }, NOW))
    expect(preview.requiresConfirmation).toBe(true)
    expect(preview.affected.length).toBeGreaterThan(0)
    expect((await repo.getNode('r'))?.content).not.toBe('hijack')
  })

  it('applies the change to a protected node with confirm', async () => {
    const repo = await chainRepo()
    const result = asNode(
      await updateNode(repo, { treeId: 't1', nodeId: 'r', content: 'new root', confirm: true }, NOW),
    )
    expect(result.content).toBe('new root')
  })

  it('throws on an unknown node', async () => {
    const repo = await chainRepo()
    await expect(updateNode(repo, { treeId: 't1', nodeId: 'ghost', content: 'x' }, NOW)).rejects.toThrow(/not found/)
  })
})

describe('moveNode', () => {
  it('re-hangs an unprotected node under a new parent', async () => {
    const repo = await chainRepo()
    const result = asNode(await moveNode(repo, { treeId: 't1', nodeId: 'e', newParentId: 'b' }, NOW))
    expect(result.parentId).toBe('b')
    expect(result.depthFromRoot).toBe(3)
  })

  it('rejects moving a node under one of its descendants (cycle)', async () => {
    const repo = await chainRepo()
    await expect(
      moveNode(repo, { treeId: 't1', nodeId: 'a', newParentId: 'd' }, NOW),
    ).rejects.toThrow(/itself or one of its descendants/)
  })

  it('returns a preview when moving a protected node without confirm', async () => {
    const repo = await chainRepo()
    const preview = asPreview(await moveNode(repo, { treeId: 't1', nodeId: 'a', newParentId: null }, NOW))
    expect(preview.requiresConfirmation).toBe(true)
  })

  it('moves a protected node into its own root with confirm', async () => {
    const repo = await chainRepo()
    const result = asNode(await moveNode(repo, { treeId: 't1', nodeId: 'a', newParentId: null, confirm: true }, NOW))
    expect(result.parentId).toBeNull()
    expect(result.depthFromRoot).toBe(0)
  })
})

describe('deleteNode', () => {
  it('deletes an unprotected leaf without friction', async () => {
    const repo = await chainRepo()
    const result = await deleteNode(repo, { treeId: 't1', nodeId: 'e' }, NOW)
    expect('deleted' in result).toBe(true)
    expect(await repo.getNode('e')).toBeUndefined()
  })

  it('returns a preview when deleting a node that has descendants', async () => {
    const repo = await chainRepo()
    const result = await deleteNode(repo, { treeId: 't1', nodeId: 'c' }, NOW)
    expect('requiresConfirmation' in result).toBe(true)
    expect(await repo.getNode('c')).toBeDefined()
  })

  it('cascade-deletes a node and its descendants with confirm', async () => {
    const repo = await chainRepo()
    const result = await deleteNode(repo, { treeId: 't1', nodeId: 'c', confirm: true }, NOW)
    expect('deleted' in result).toBe(true)
    expect(await repo.getNode('c')).toBeUndefined()
    expect(await repo.getNode('d')).toBeUndefined()
    expect(await repo.getNode('e')).toBeUndefined()
    expect(await repo.getNode('b')).toBeDefined()
  })
})
