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
    const roots = await getResolvedTree(repo, 't1', NOW)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.id).toBe('r')
    expect(roots[0]?.protected).toBe(true)
    expect(roots[0]?.children[0]?.id).toBe('a')
  })

  it('resolves several roots as a forest', async () => {
    const repo = await seed(node('r1', null), node('r2', null), node('a', 'r1'))
    const roots = await getResolvedTree(repo, 't1', NOW)
    expect(roots.map((r) => r.id).sort()).toEqual(['r1', 'r2'])
  })

  it('resolves a subtree from storage', async () => {
    const repo = await seed(node('r', null), node('a', 'r'), node('b', 'a'))
    const sub = await getResolvedSubtree(repo, 't1', 'a', NOW)
    expect(sub.id).toBe('a')
    expect(sub.children[0]?.id).toBe('b')
  })

  it('returns an empty forest for an unknown or empty tree', async () => {
    const repo = new InMemoryTreeRepository()
    expect(await getResolvedTree(repo, 'nope', NOW)).toEqual([])
  })

  it('isolates nodes by tree id', async () => {
    const repo = await seed(node('r1', null), node('r2', null, { treeId: 't2' }))
    expect((await getResolvedTree(repo, 't1', NOW)).map((r) => r.id)).toEqual(['r1'])
    expect((await getResolvedTree(repo, 't2', NOW)).map((r) => r.id)).toEqual(['r2'])
  })

  it('rejects duplicate inserts', async () => {
    const repo = await seed(node('r', null))
    await expect(repo.insertNode(node('r', null))).rejects.toThrow(/duplicate/)
  })

  it('returns only protected nodes, flattened', async () => {
    const repo = await seed(node('r', null), node('a', 'r'), node('deep', 'a'))
    const core = await getProtectedNodes(repo, 't1', NOW)
    expect(core.every((n) => n.children.length === 0)).toBe(true)
    expect(core.some((n) => n.id === 'r')).toBe(true)
    expect(core.some((n) => n.id === 'deep')).toBe(false)
  })
})
