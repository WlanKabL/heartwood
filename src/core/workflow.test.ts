import { describe, it, expect } from 'vitest'
import type { TreeNode } from './types.js'
import { InMemoryTreeRepository } from './repository.js'
import { InMemoryWorkflowRepository } from './workflow-repository.js'
import { defineWorkflow, runWorkflow } from './workflow.js'

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

describe('defineWorkflow', () => {
  it('saves a workflow and preserves createdAt on update', async () => {
    const repo = new InMemoryWorkflowRepository()
    const first = await defineWorkflow(repo, { treeId: 't', name: 'plan_post', description: 'd', template: 'x' }, NOW)
    const later = new Date('2027-01-01T00:00:00.000Z')
    const second = await defineWorkflow(repo, { treeId: 't', name: 'plan_post', description: 'd2', template: 'y' }, later)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt).not.toBe(first.updatedAt)
    expect(second.template).toBe('y')
  })

  it('rejects an invalid name', async () => {
    const repo = new InMemoryWorkflowRepository()
    await expect(
      defineWorkflow(repo, { treeId: 't', name: 'Bad Name!', description: 'd', template: 'x' }, NOW),
    ).rejects.toThrow(/invalid workflow name/)
  })

  it('rejects an empty template', async () => {
    const repo = new InMemoryWorkflowRepository()
    await expect(
      defineWorkflow(repo, { treeId: 't', name: 'a', description: 'd', template: '   ' }, NOW),
    ).rejects.toThrow(/template/)
  })
})

describe('runWorkflow', () => {
  it('fills {{truths}} from the tree and {{input}} from the caller', async () => {
    const treeRepo = new InMemoryTreeRepository()
    await treeRepo.insertNode(node('r', null, { content: 'the root truth' }))
    const wfRepo = new InMemoryWorkflowRepository()
    await defineWorkflow(
      wfRepo,
      { treeId: 't1', name: 'draft', description: 'd', template: 'Truths:\n{{truths}}\n\nTask: {{ input }}' },
      NOW,
    )
    const out = await runWorkflow(treeRepo, wfRepo, { treeId: 't1', name: 'draft', input: 'write a post' }, NOW)
    expect(out).toContain('the root truth')
    expect(out).toContain('write a post')
    expect(out).not.toContain('{{')
  })

  it('throws on an unknown workflow', async () => {
    await expect(
      runWorkflow(new InMemoryTreeRepository(), new InMemoryWorkflowRepository(), { treeId: 't', name: 'nope' }, NOW),
    ).rejects.toThrow(/not found/)
  })
})
