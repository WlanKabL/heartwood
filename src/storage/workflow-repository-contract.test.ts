import { describe, it, expect } from 'vitest'
import type { Workflow, WorkflowRepository } from '../core/workflow-repository.js'
import { InMemoryWorkflowStore } from '../core/workflow-repository.js'
import { PostgresWorkflowStore } from './postgres-workflows.js'
import { setupPostgresTests, getDb, getUserA, getUserB } from './postgres-test-setup.js'

const STAMP = '2026-01-01T00:00:00.000Z'

const wf = (treeId: string, name: string, extra: Partial<Workflow> = {}): Workflow => ({
  treeId,
  name,
  description: `desc ${name}`,
  template: `template ${name}`,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
})

const contract = (label: string, make: () => WorkflowRepository): void => {
  describe(`WorkflowRepository contract: ${label}`, () => {
    it('saves and lists workflows by tree', async () => {
      const repo = make()
      await repo.saveWorkflow(wf('t1', 'a'))
      await repo.saveWorkflow(wf('t1', 'b'))
      await repo.saveWorkflow(wf('t2', 'c'))
      expect((await repo.listWorkflows('t1')).map((w) => w.name).sort()).toEqual(['a', 'b'])
    })

    it('gets a workflow by name', async () => {
      const repo = make()
      await repo.saveWorkflow(wf('t1', 'a', { template: 'hello {{truths}}' }))
      expect((await repo.getWorkflow('t1', 'a'))?.template).toBe('hello {{truths}}')
    })

    it('returns undefined for an unknown workflow', async () => {
      expect(await make().getWorkflow('t1', 'nope')).toBeUndefined()
    })

    it('upserts on save', async () => {
      const repo = make()
      await repo.saveWorkflow(wf('t1', 'a', { template: 'v1' }))
      await repo.saveWorkflow(wf('t1', 'a', { template: 'v2', updatedAt: '2027-01-01T00:00:00.000Z' }))
      expect((await repo.getWorkflow('t1', 'a'))?.template).toBe('v2')
      expect(await repo.listWorkflows('t1')).toHaveLength(1)
    })

    it('deletes a workflow', async () => {
      const repo = make()
      await repo.saveWorkflow(wf('t1', 'a'))
      await repo.deleteWorkflow('t1', 'a')
      expect(await repo.getWorkflow('t1', 'a')).toBeUndefined()
    })

    it('rejects deleting an unknown workflow', async () => {
      await expect(make().deleteWorkflow('t1', 'nope')).rejects.toThrow(/not found/)
    })
  })
}

contract('InMemory (via InMemoryWorkflowStore.forUser)', () => new InMemoryWorkflowStore().forUser('user-a'))

describe('InMemoryWorkflowStore: cross-tenant isolation', () => {
  it('a workflow saved by user-a is not listed by user-b', async () => {
    const store = new InMemoryWorkflowStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.saveWorkflow(wf('t1', 'my-workflow'))
    expect(await repoB.listWorkflows('t1')).toHaveLength(0)
  })

  it('a workflow saved by user-a is not found by user-b via getWorkflow', async () => {
    const store = new InMemoryWorkflowStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.saveWorkflow(wf('t1', 'my-workflow'))
    expect(await repoB.getWorkflow('t1', 'my-workflow')).toBeUndefined()
  })

  it('deleteWorkflow of user-a workflow from user-b throws not found', async () => {
    const store = new InMemoryWorkflowStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.saveWorkflow(wf('t1', 'my-workflow'))
    await expect(repoB.deleteWorkflow('t1', 'my-workflow')).rejects.toThrow(/not found/)
  })

  it('two users can each have a workflow with the same name in the same tree', async () => {
    const store = new InMemoryWorkflowStore()
    const repoA = store.forUser('user-a')
    const repoB = store.forUser('user-b')

    await repoA.saveWorkflow(wf('t1', 'shared-name', { template: 'user-a template' }))
    await repoB.saveWorkflow(wf('t1', 'shared-name', { template: 'user-b template' }))

    expect((await repoA.getWorkflow('t1', 'shared-name'))?.template).toBe('user-a template')
    expect((await repoB.getWorkflow('t1', 'shared-name'))?.template).toBe('user-b template')
  })
})

// ── Postgres contract + isolation ────────────────────────────────────────────

setupPostgresTests()

const makePostgresWorkflowRepo = (userGetter: () => string): (() => WorkflowRepository) => {
  return () => new PostgresWorkflowStore(getDb()).forUser(userGetter())
}

contract('Postgres (userA)', makePostgresWorkflowRepo(getUserA))

describe('PostgresWorkflowStore: cross-tenant isolation', () => {
  it('a workflow saved by userA is not listed by userB', async () => {
    const store = new PostgresWorkflowStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.saveWorkflow(wf('t1', 'my-workflow'))
    expect(await repoB.listWorkflows('t1')).toHaveLength(0)
  })

  it('a workflow saved by userA is not found by userB via getWorkflow', async () => {
    const store = new PostgresWorkflowStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.saveWorkflow(wf('t1', 'my-workflow'))
    expect(await repoB.getWorkflow('t1', 'my-workflow')).toBeUndefined()
  })

  it('deleteWorkflow of userA workflow from userB throws not found', async () => {
    const store = new PostgresWorkflowStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.saveWorkflow(wf('t1', 'my-workflow'))
    await expect(repoB.deleteWorkflow('t1', 'my-workflow')).rejects.toThrow(/not found/)
  })

  it('two users can each have a workflow with the same name in the same tree', async () => {
    const store = new PostgresWorkflowStore(getDb())
    const repoA = store.forUser(getUserA())
    const repoB = store.forUser(getUserB())

    await repoA.saveWorkflow(wf('t1', 'shared-name', { template: 'user-a template' }))
    await repoB.saveWorkflow(wf('t1', 'shared-name', { template: 'user-b template' }))

    expect((await repoA.getWorkflow('t1', 'shared-name'))?.template).toBe('user-a template')
    expect((await repoB.getWorkflow('t1', 'shared-name'))?.template).toBe('user-b template')
  })
})
