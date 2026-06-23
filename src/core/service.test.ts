import { describe, it, expect } from 'vitest'
import type { TreeNode } from './types.js'
import { InMemoryTreeRepository } from './repository.js'
import { getResolvedTree, getResolvedSubtree, getProtectedNodes } from './service.js'

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

const seed = async (...nodes: TreeNode[]): Promise<InMemoryTreeRepository> => {
  const repo = new InMemoryTreeRepository()
  for (const n of nodes) await repo.insertNode(n)
  return repo
}

describe('service over InMemoryTreeRepository', () => {
  it('resolves a stored tree with computed hardness', async () => {
    const repo = await seed(node('r', null), node('a', 'r'))
    const tree = await getResolvedTree(repo, 't1', NOW)
    expect(tree?.id).toBe('r')
    expect(tree?.band).toBe('root')
    expect(tree?.children[0]?.id).toBe('a')
  })

  it('resolves a subtree from storage', async () => {
    const repo = await seed(node('r', null), node('a', 'r'), node('b', 'a'))
    const sub = await getResolvedSubtree(repo, 't1', 'a', NOW)
    expect(sub.id).toBe('a')
    expect(sub.children[0]?.id).toBe('b')
  })

  it('returns null for an unknown or empty tree', async () => {
    const repo = new InMemoryTreeRepository()
    expect(await getResolvedTree(repo, 'nope', NOW)).toBeNull()
  })

  it('isolates nodes by tree id', async () => {
    const repo = await seed(node('r1', null), node('r2', null, { treeId: 't2' }))
    expect((await getResolvedTree(repo, 't1', NOW))?.id).toBe('r1')
    expect((await getResolvedTree(repo, 't2', NOW))?.id).toBe('r2')
  })

  it('rejects duplicate inserts', async () => {
    const repo = await seed(node('r', null))
    await expect(repo.insertNode(node('r', null))).rejects.toThrow(/duplicate/)
  })

  it('returns only nodes above the protection threshold, flattened', async () => {
    const repo = await seed(node('r', null), node('a', 'r'), node('deep', 'a'))
    const core = await getProtectedNodes(repo, 't1', NOW)
    expect(core.every((n) => n.children.length === 0)).toBe(true)
    expect(core.some((n) => n.id === 'r')).toBe(true)
    expect(core.some((n) => n.id === 'deep')).toBe(false)
  })
})
