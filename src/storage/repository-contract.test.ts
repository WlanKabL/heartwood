import { describe, it, expect } from 'vitest'
import type { TreeNode } from '../core/types.js'
import type { TreeRepository } from '../core/repository.js'
import { InMemoryTreeStore } from '../core/repository.js'
import { PostgresTreeStore } from './postgres-trees.js'
import { setupPostgresTests, getDb, getUserA, getUserB } from './postgres-test-setup.js'

const STAMP = '2026-01-01T00:00:00.000Z'

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

/** One behaviour suite, run against every TreeRepository implementation. */
const contract = (name: string, make: () => TreeRepository): void => {
  describe(`TreeRepository contract: ${name}`, () => {
    it('stores and lists nodes by tree', async () => {
      const repo = make()
      await repo.insertNode(node('r', null))
      await repo.insertNode(node('a', 'r'))
      const ids = (await repo.listNodes('t1')).map((n) => n.id).sort()
      expect(ids).toEqual(['a', 'r'])
    })

    it('round-trips every field, including a null parent and null hardness', async () => {
      const repo = make()
      const original = node('r', null)
      await repo.insertNode(original)
      expect(await repo.getNode('r')).toEqual(original)
    })

    it('round-trips a set hardness and a non-null parent', async () => {
      const repo = make()
      await repo.insertNode(node('r', null))
      const child = node('a', 'r', { hardnessSet: 30, status: 'deprecated' })
      await repo.insertNode(child)
      expect(await repo.getNode('a')).toEqual(child)
    })

    it('returns undefined for an unknown node', async () => {
      expect(await make().getNode('nope')).toBeUndefined()
    })

    it('isolates nodes by tree id', async () => {
      const repo = make()
      await repo.insertNode(node('r1', null))
      await repo.insertNode(node('r2', null, { treeId: 't2' }))
      expect((await repo.listNodes('t1')).map((n) => n.id)).toEqual(['r1'])
      expect((await repo.listNodes('t2')).map((n) => n.id)).toEqual(['r2'])
    })

    it('lists distinct tree ids', async () => {
      const repo = make()
      await repo.insertNode(node('r1', null))
      await repo.insertNode(node('r2', null, { treeId: 't2' }))
      expect((await repo.listTreeIds()).sort()).toEqual(['t1', 't2'])
    })

    it('rejects duplicate ids with a consistent error', async () => {
      const repo = make()
      await repo.insertNode(node('r', null))
      await expect(repo.insertNode(node('r', null))).rejects.toThrow(/duplicate/)
    })

    it('updates an existing node', async () => {
      const repo = make()
      await repo.insertNode(node('r', null))
      await repo.updateNode(node('r', null, { content: 'changed', hardnessSet: 70 }))
      const fetched = await repo.getNode('r')
      expect(fetched?.content).toBe('changed')
      expect(fetched?.hardnessSet).toBe(70)
    })

    it('rejects updating an unknown node', async () => {
      await expect(make().updateNode(node('ghost', null))).rejects.toThrow(/unknown/)
    })

    it('deletes a node', async () => {
      const repo = make()
      await repo.insertNode(node('r', null))
      await repo.deleteNode('r')
      expect(await repo.getNode('r')).toBeUndefined()
    })

    it('rejects deleting an unknown node', async () => {
      await expect(make().deleteNode('ghost')).rejects.toThrow(/unknown/)
    })

    it('listTreeSummaries returns counts per tree', async () => {
      const repo = make()
      await repo.insertNode(node('r1', null))
      await repo.insertNode(node('r2', null, { treeId: 't2' }))
      await repo.insertNode(node('r3', null, { treeId: 't2' }))
      const summaries = (await repo.listTreeSummaries()).sort((a, b) => a.treeId.localeCompare(b.treeId))
      expect(summaries).toEqual([
        { treeId: 't1', nodeCount: 1 },
        { treeId: 't2', nodeCount: 2 },
      ])
    })

    it('listTreeSummaries returns empty array when user has no nodes', async () => {
      expect(await make().listTreeSummaries()).toEqual([])
    })

    it('deleteTree removes all nodes in the tree and returns the count', async () => {
      const repo = make()
      await repo.insertNode(node('r1', null))
      await repo.insertNode(node('r2', null, { treeId: 't2' }))
      const removed = await repo.deleteTree('t1')
      expect(removed).toBe(1)
      expect(await repo.listNodes('t1')).toHaveLength(0)
      expect(await repo.listNodes('t2')).toHaveLength(1)
    })

    it('deleteTree returns 0 when the tree does not exist', async () => {
      expect(await make().deleteTree('nonexistent')).toBe(0)
    })

    it('searchNodes matches by label case-insensitively', async () => {
      const repo = make()
      await repo.insertNode(node('r', null, { label: 'Identity', content: 'irrelevant' }))
      await repo.insertNode(node('a', 'r', { label: 'voice', content: 'something else' }))
      const hits = await repo.searchNodes('t1', 'IDENT')
      expect(hits.map((n) => n.id)).toEqual(['r'])
    })

    it('searchNodes matches by content case-insensitively', async () => {
      const repo = make()
      await repo.insertNode(node('r', null, { content: 'The Portable Animal Record' }))
      const hits = await repo.searchNodes('t1', 'portable')
      expect(hits.map((n) => n.id)).toEqual(['r'])
    })

    it('searchNodes returns empty when no match', async () => {
      const repo = make()
      await repo.insertNode(node('r', null, { label: 'identity', content: 'nothing here' }))
      expect(await repo.searchNodes('t1', 'zzznomatch')).toHaveLength(0)
    })

    it('searchNodes is scoped to the requested treeId', async () => {
      const repo = make()
      await repo.insertNode(node('r1', null, { treeId: 't1', label: 'identity', content: 'x' }))
      await repo.insertNode(node('r2', null, { treeId: 't2', label: 'identity', content: 'x' }))
      const hits = await repo.searchNodes('t1', 'identity')
      expect(hits.map((n) => n.id)).toEqual(['r1'])
    })
  })
}

contract('InMemory (via InMemoryTreeStore.forUser)', () => new InMemoryTreeStore().forUser('user-a'))

// Cross-tenant isolation suite: every InMemoryTreeStore instance is the shared store;
// user-a's data must be completely invisible to user-b and vice versa.
describe('InMemoryTreeStore: cross-tenant isolation', () => {
  it('a node inserted by user-a is not visible to user-b via listNodes', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('n1', null))
    expect(await repoB.listNodes('t1')).toHaveLength(0)
  })

  it('a node inserted by user-a is not visible to user-b via getNode', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('n1', null))
    expect(await repoB.getNode('n1')).toBeUndefined()
  })

  it('updateNode of user-a node from user-b throws unknown-id', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('n1', null))
    await expect(repoB.updateNode(node('n1', null, { content: 'hijacked' }))).rejects.toThrow(/unknown/)
  })

  it('deleteNode of user-a node from user-b throws unknown-id', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('n1', null))
    await expect(repoB.deleteNode('n1')).rejects.toThrow(/unknown/)
  })

  it('two users can each have a tree named "keeperlog" without collision', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('a-root', null, { treeId: 'keeperlog', content: 'user-a truth' }))
    await repoB.insertNode(node('b-root', null, { treeId: 'keeperlog', content: 'user-b truth' }))

    const aNodes = await repoA.listNodes('keeperlog')
    const bNodes = await repoB.listNodes('keeperlog')

    expect(aNodes).toHaveLength(1)
    expect(aNodes[0]?.content).toBe('user-a truth')
    expect(bNodes).toHaveLength(1)
    expect(bNodes[0]?.content).toBe('user-b truth')
  })

  it('listTreeIds only returns tree ids belonging to the bound user', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('a1', null, { treeId: 'tree-a' }))
    await repoB.insertNode(node('b1', null, { treeId: 'tree-b' }))

    expect(await repoA.listTreeIds()).toEqual(['tree-a'])
    expect(await repoB.listTreeIds()).toEqual(['tree-b'])
  })

  it('listTreeSummaries does not include trees belonging to another user', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('a1', null, { treeId: 'tree-a' }))
    await repoB.insertNode(node('b1', null, { treeId: 'tree-b' }))

    const summariesA = await repoA.listTreeSummaries()
    expect(summariesA.map((s) => s.treeId)).toEqual(['tree-a'])
    const summariesB = await repoB.listTreeSummaries()
    expect(summariesB.map((s) => s.treeId)).toEqual(['tree-b'])
  })

  it('deleteTree from user-b does not remove user-a nodes', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('a1', null, { treeId: 'tree-a' }))
    const removed = await repoB.deleteTree('tree-a')
    expect(removed).toBe(0)
    expect(await repoA.listNodes('tree-a')).toHaveLength(1)
  })

  it('searchNodes from user-b returns nothing for user-a tree', async () => {
    const store = new InMemoryTreeStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.insertNode(node('a1', null, { treeId: 't1', label: 'identity', content: 'x' }))
    expect(await repoB.searchNodes('t1', 'identity')).toHaveLength(0)
  })
})

// ── Postgres contract + isolation ────────────────────────────────────────────

setupPostgresTests()

/**
 * A factory that uses the live Postgres db and the current test user id.
 * Must be called inside a test (after beforeAll/beforeEach ran).
 */
const makePostgresRepo = (userGetter: () => string): (() => TreeRepository) => {
  return () => new PostgresTreeStore(getDb()).forUser(userGetter())
}

contract('Postgres (userA)', makePostgresRepo(getUserA))

describe('PostgresTreeStore: cross-tenant isolation', () => {
  it('a node inserted by userA is not visible to userB via listNodes', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('n1', null))
    expect(await repoB.listNodes('t1')).toHaveLength(0)
  })

  it('a node inserted by userA is not visible to userB via getNode', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('n1', null))
    expect(await repoB.getNode('n1')).toBeUndefined()
  })

  it('updateNode of userA node from userB throws unknown-id', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('n1', null))
    await expect(repoB.updateNode(node('n1', null, { content: 'hijacked' }))).rejects.toThrow(/unknown/)
  })

  it('deleteNode of userA node from userB throws unknown-id', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('n1', null))
    await expect(repoB.deleteNode('n1')).rejects.toThrow(/unknown/)
  })

  it('two users can each have a tree named "keeperlog" without collision', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('a-root', null, { treeId: 'keeperlog', content: 'user-a truth' }))
    await repoB.insertNode(node('b-root', null, { treeId: 'keeperlog', content: 'user-b truth' }))

    const aNodes = await repoA.listNodes('keeperlog')
    const bNodes = await repoB.listNodes('keeperlog')

    expect(aNodes).toHaveLength(1)
    expect(aNodes[0]?.content).toBe('user-a truth')
    expect(bNodes).toHaveLength(1)
    expect(bNodes[0]?.content).toBe('user-b truth')
  })

  it('listTreeIds only returns tree ids belonging to the bound user', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('a1', null, { treeId: 'tree-a' }))
    await repoB.insertNode(node('b1', null, { treeId: 'tree-b' }))

    expect(await repoA.listTreeIds()).toEqual(['tree-a'])
    expect(await repoB.listTreeIds()).toEqual(['tree-b'])
  })

  it('listTreeSummaries does not include trees belonging to another user', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('a1', null, { treeId: 'tree-a' }))
    await repoB.insertNode(node('b1', null, { treeId: 'tree-b' }))

    const summariesA = await repoA.listTreeSummaries()
    expect(summariesA.map((s) => s.treeId)).toEqual(['tree-a'])
    const summariesB = await repoB.listTreeSummaries()
    expect(summariesB.map((s) => s.treeId)).toEqual(['tree-b'])
  })

  it('deleteTree from userB does not remove userA nodes', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('a1', null, { treeId: 'tree-a' }))
    const removed = await repoB.deleteTree('tree-a')
    expect(removed).toBe(0)
    expect(await repoA.listNodes('tree-a')).toHaveLength(1)
  })

  it('searchNodes from userB returns nothing for userA tree', async () => {
    const store = new PostgresTreeStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.insertNode(node('a1', null, { treeId: 't1', label: 'identity', content: 'x' }))
    expect(await repoB.searchNodes('t1', 'identity')).toHaveLength(0)
  })
})
