import { describe, it, expect } from 'vitest'
import type { Workflow, WorkflowRepository } from '../core/workflow-repository.js'
import { InMemoryWorkflowRepository } from '../core/workflow-repository.js'
import { SqliteWorkflowRepository } from './sqlite-workflows.js'

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

contract('InMemory', () => new InMemoryWorkflowRepository())
contract('Sqlite', () => new SqliteWorkflowRepository(':memory:'))
