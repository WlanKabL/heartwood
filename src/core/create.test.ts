import { describe, it, expect } from 'vitest'
import { InMemoryTreeRepository } from './repository.js'
import { createNode } from './create.js'

const NOW = new Date('2026-01-01T00:00:00.000Z')

describe('createNode', () => {
  it('creates a root and computes its hardness from position', async () => {
    const repo = new InMemoryTreeRepository()
    const root = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'identity', content: 'portable animal record' },
      NOW,
    )
    expect(root.parentId).toBeNull()
    expect(root.depthFromRoot).toBe(0)
    expect(root.protected).toBe(true)
  })

  it('creates a child under an existing parent', async () => {
    const repo = new InMemoryTreeRepository()
    const root = await createNode(repo, { treeId: 't1', parentId: null, label: 'root', content: 'x' }, NOW)
    const child = await createNode(repo, { treeId: 't1', parentId: root.id, label: 'voice', content: 'y' }, NOW)
    expect(child.parentId).toBe(root.id)
    expect(child.depthFromRoot).toBe(1)
  })

  it('allows several roots in the same tree', async () => {
    const repo = new InMemoryTreeRepository()
    await createNode(repo, { treeId: 't1', parentId: null, label: 'identity', content: 'x' }, NOW)
    const second = await createNode(repo, { treeId: 't1', parentId: null, label: 'voice', content: 'y' }, NOW)
    expect(second.parentId).toBeNull()
    expect(second.depthFromRoot).toBe(0)
  })

  it('rejects an unknown parent', async () => {
    const repo = new InMemoryTreeRepository()
    await expect(
      createNode(repo, { treeId: 't1', parentId: 'ghost', label: 'x', content: 'y' }, NOW),
    ).rejects.toThrow(/not found/)
  })

  it('clamps a proposed hardness on a deep leaf so it stays unprotected (the QR case)', async () => {
    const repo = new InMemoryTreeRepository()
    let parent = await createNode(repo, { treeId: 't1', parentId: null, label: 'root', content: 'x' }, NOW)
    for (const label of ['a', 'b', 'c', 'd']) {
      parent = await createNode(repo, { treeId: 't1', parentId: parent.id, label, content: 'x' }, NOW)
    }
    const leaf = await createNode(
      repo,
      { treeId: 't1', parentId: parent.id, label: 'qr', content: 'qr handover', hardnessSet: 100 },
      NOW,
    )
    expect(leaf.protected).toBe(false)
    expect(leaf.effectiveHardness).toBeLessThan(50)
  })
})
