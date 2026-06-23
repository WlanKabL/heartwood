import type { TreeRepository } from './repository.js'
import type { Workflow, WorkflowRepository } from './workflow-repository.js'
import type { ResolvedNode } from './types.js'
import { getProtectedNodes } from './service.js'

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/** Renders a flat list of protected truths for injection into a workflow or hook. */
export const formatTruths = (nodes: ResolvedNode[]): string =>
  nodes.length === 0
    ? '(no protected truths yet)'
    : nodes
        .slice()
        .sort((a, b) => b.effectiveHardness - a.effectiveHardness)
        .map((n) => `- ${n.label} (hardness ${Math.round(n.effectiveHardness)}): ${n.content}`)
        .join('\n')

export interface DefineWorkflowInput {
  treeId: string
  name: string
  description: string
  template: string
}

/** Creates or updates a workflow. Preserves createdAt on update; validates name and template. */
export const defineWorkflow = async (
  repo: WorkflowRepository,
  input: DefineWorkflowInput,
  now: Date,
): Promise<Workflow> => {
  if (!NAME_PATTERN.test(input.name)) {
    throw new Error(`invalid workflow name "${input.name}": use lowercase letters, digits, - and _`)
  }
  if (input.template.trim().length === 0) {
    throw new Error('workflow template must not be empty')
  }
  const existing = await repo.getWorkflow(input.treeId, input.name)
  const stamp = now.toISOString()
  const workflow: Workflow = {
    treeId: input.treeId,
    name: input.name,
    description: input.description,
    template: input.template,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  }
  await repo.saveWorkflow(workflow)
  return workflow
}

export interface RunWorkflowInput {
  treeId: string
  name: string
  input?: string
}

/** Loads a workflow and fills {{truths}} with the project's protected core and {{input}} with the caller's input. */
export const runWorkflow = async (
  treeRepo: TreeRepository,
  wfRepo: WorkflowRepository,
  request: RunWorkflowInput,
  now: Date,
): Promise<string> => {
  const workflow = await wfRepo.getWorkflow(request.treeId, request.name)
  if (!workflow) throw new Error(`workflow ${request.name} not found in tree ${request.treeId}`)
  const truths = formatTruths(await getProtectedNodes(treeRepo, request.treeId, now))
  return workflow.template
    .replace(/\{\{\s*truths\s*\}\}/g, truths)
    .replace(/\{\{\s*input\s*\}\}/g, request.input ?? '')
}
