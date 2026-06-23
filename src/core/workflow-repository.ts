/**
 * User-defined workflows: named, reusable procedures stored per tree. A workflow is a
 * template (text with {{truths}} and {{input}} placeholders) that the runner fills with
 * the project's truths and the caller's input. Workflows are procedures, not truths, so
 * they live in their own store, separate from the tree.
 */
export interface Workflow {
  treeId: string
  name: string
  description: string
  template: string
  createdAt: string
  updatedAt: string
}

/**
 * Factory: hands out a WorkflowRepository already scoped to one tenant.
 */
export interface WorkflowStore {
  forUser(userId: string): WorkflowRepository
}

/**
 * User-bound workflow repository. Every instance is scoped to one user;
 * callers never pass userId.
 */
export interface WorkflowRepository {
  listWorkflows(treeId: string): Promise<Workflow[]>
  getWorkflow(treeId: string, name: string): Promise<Workflow | undefined>
  saveWorkflow(workflow: Workflow): Promise<void> // upsert by (treeId, name)
  deleteWorkflow(treeId: string, name: string): Promise<void>
}

const key = (treeId: string, name: string): string => `${treeId} ${name}`

/** One user's view into the shared InMemory workflow store. */
class BoundInMemoryWorkflowRepository implements WorkflowRepository {
  constructor(
    private readonly store: Map<string, { userId: string; workflow: Workflow }>,
    private readonly userId: string,
  ) {}

  async listWorkflows(treeId: string): Promise<Workflow[]> {
    return [...this.store.values()]
      .filter((entry) => entry.userId === this.userId && entry.workflow.treeId === treeId)
      .map((entry) => entry.workflow)
  }

  async getWorkflow(treeId: string, name: string): Promise<Workflow | undefined> {
    const entry = this.store.get(key(treeId, name) + ':' + this.userId)
    return entry?.workflow
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    const k = key(workflow.treeId, workflow.name) + ':' + this.userId
    this.store.set(k, { userId: this.userId, workflow: { ...workflow } })
  }

  async deleteWorkflow(treeId: string, name: string): Promise<void> {
    const k = key(treeId, name) + ':' + this.userId
    if (!this.store.delete(k)) {
      throw new Error(`workflow ${name} not found in tree ${treeId}`)
    }
  }
}

/** In-memory workflow store. Backs the unit tests and the workflow contract suite. */
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly store = new Map<string, { userId: string; workflow: Workflow }>()

  forUser(userId: string): WorkflowRepository {
    return new BoundInMemoryWorkflowRepository(this.store, userId)
  }
}
