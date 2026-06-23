import { describe, it, expect } from 'vitest'
import { InMemoryTreeStore } from './repository.js'
import { createNode } from './create.js'

const NOW = new Date('2026-01-01T00:00:00.000Z')

describe('createNode', () => {
  it('creates a root and computes its hardness from position', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { node: root } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'identity', content: 'portable animal record' },
      NOW,
    )
    expect(root.parentId).toBeNull()
    expect(root.depthFromRoot).toBe(0)
    expect(root.protected).toBe(true)
  })

  it('creates a child under an existing parent', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { node: root } = await createNode(repo, { treeId: 't1', parentId: null, label: 'root', content: 'x' }, NOW)
    const { node: child } = await createNode(repo, { treeId: 't1', parentId: root.id, label: 'voice', content: 'y' }, NOW)
    expect(child.parentId).toBe(root.id)
    expect(child.depthFromRoot).toBe(1)
  })

  it('allows several roots in the same tree', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    await createNode(repo, { treeId: 't1', parentId: null, label: 'identity', content: 'x' }, NOW)
    const { node: second } = await createNode(repo, { treeId: 't1', parentId: null, label: 'voice', content: 'y' }, NOW)
    expect(second.parentId).toBeNull()
    expect(second.depthFromRoot).toBe(0)
  })

  it('rejects an unknown parent', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    await expect(
      createNode(repo, { treeId: 't1', parentId: 'ghost', label: 'x', content: 'y' }, NOW),
    ).rejects.toThrow(/not found/)
  })

  it('clamps a proposed hardness on a deep leaf so it stays unprotected (the QR case)', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    let parent = (await createNode(repo, { treeId: 't1', parentId: null, label: 'root', content: 'x' }, NOW)).node
    for (const label of ['a', 'b', 'c', 'd']) {
      parent = (await createNode(repo, { treeId: 't1', parentId: parent.id, label, content: 'x' }, NOW)).node
    }
    const { node: leaf, hardnessNote } = await createNode(
      repo,
      { treeId: 't1', parentId: parent.id, label: 'qr', content: 'qr handover', hardnessSet: 100 },
      NOW,
    )
    expect(leaf.protected).toBe(false)
    expect(leaf.effectiveHardness).toBeLessThan(50)
    // A high proposal on a deep leaf hits the ceiling and should surface a note.
    expect(hardnessNote).toBeDefined()
    expect(hardnessNote).toMatch(/structurally light/)
  })

  it('returns hardnessNote when a root proposal is raised to the floor', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { hardnessNote } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'identity', content: 'x', hardnessSet: 20 },
      NOW,
    )
    expect(hardnessNote).toBeDefined()
    expect(hardnessNote).toMatch(/raised/)
    expect(hardnessNote).toMatch(/20/)
  })

  it('returns no hardnessNote when no hardnessSet is proposed', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { hardnessNote } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'identity', content: 'x' },
      NOW,
    )
    expect(hardnessNote).toBeUndefined()
  })

  // --- volatility warning ---

  it('returns a volatilityWarning when content contains a price', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { volatilityWarning } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'pricing', content: 'starter plan costs €9 per month' },
      NOW,
    )
    expect(volatilityWarning).toBeDefined()
    expect(volatilityWarning).toMatch(/changing figure/)
  })

  it('returns a volatilityWarning when content contains a percentage', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { volatilityWarning } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'conversion', content: 'sign-up conversion is 4% this quarter' },
      NOW,
    )
    expect(volatilityWarning).toBeDefined()
  })

  it('returns a volatilityWarning when content contains an ISO date', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { volatilityWarning } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'launch', content: 'public launch was 2024-03-15' },
      NOW,
    )
    expect(volatilityWarning).toBeDefined()
  })

  it('returns a volatilityWarning when content contains an explicit version', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { volatilityWarning } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'stack', content: 'deployed on v2.1 of the runtime' },
      NOW,
    )
    expect(volatilityWarning).toBeDefined()
  })

  it('does not return a volatilityWarning for clean durable content', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { volatilityWarning } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'identity', content: 'built by a keeper for keepers' },
      NOW,
    )
    expect(volatilityWarning).toBeUndefined()
  })

  // --- dedup / similarTo hint ---

  it('returns similarTo when another node shares salient label words', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { node: existing } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'pricing model', content: 'subscription only' },
      NOW,
    )
    const { similarTo } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'pricing strategy', content: 'tiered plans' },
      NOW,
    )
    expect(similarTo).toBeDefined()
    expect(similarTo?.id).toBe(existing.id)
    expect(similarTo?.label).toBe('pricing model')
  })

  it('does not return similarTo for a clearly distinct node', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'authentication approach', content: 'jwt refresh tokens' },
      NOW,
    )
    const { similarTo } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'visual identity', content: 'dark editorial palette' },
      NOW,
    )
    expect(similarTo).toBeUndefined()
  })

  it('does not include the newly created node itself in the similarTo result', async () => {
    const repo = new InMemoryTreeStore().forUser('test-user')
    const { node, similarTo } = await createNode(
      repo,
      { treeId: 't1', parentId: null, label: 'brand identity', content: 'editorial and bold' },
      NOW,
    )
    // Only one node exists: the new one. It must not point at itself.
    expect(similarTo?.id).not.toBe(node.id)
    expect(similarTo).toBeUndefined()
  })
})
