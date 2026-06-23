import { describe, it, expect } from 'vitest'
import type { TreeNode } from '../core/types.js'
import type { TreeRepository } from '../core/repository.js'
import { InMemoryTreeRepository } from '../core/repository.js'
import { SqliteTreeRepository } from './sqlite.js'

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
  })
}

contract('InMemory', () => new InMemoryTreeRepository())
contract('Sqlite', () => new SqliteTreeRepository(':memory:'))
