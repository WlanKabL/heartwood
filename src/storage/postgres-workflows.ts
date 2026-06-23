import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { Workflow, WorkflowStore, WorkflowRepository } from '../core/workflow-repository.js'
import type { Db } from './db.js'
import { workflows } from './schema.js'

const RowSchema = z.object({
  userId: z.string(),
  treeId: z.string(),
  name: z.string(),
  description: z.string(),
  template: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const rowToWorkflow = (row: unknown): Workflow => {
  const r = RowSchema.parse(row)
  return {
    treeId: r.treeId,
    name: r.name,
    description: r.description,
    template: r.template,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

class PostgresWorkflowRepository implements WorkflowRepository {
  constructor(
    private readonly db: Db,
    private readonly userId: string,
  ) {}

  async listWorkflows(treeId: string): Promise<Workflow[]> {
    const rows = await this.db
      .select()
      .from(workflows)
      .where(and(eq(workflows.userId, this.userId), eq(workflows.treeId, treeId)))
    return rows.map(rowToWorkflow)
  }

  async getWorkflow(treeId: string, name: string): Promise<Workflow | undefined> {
    const rows = await this.db
      .select()
      .from(workflows)
      .where(
        and(eq(workflows.userId, this.userId), eq(workflows.treeId, treeId), eq(workflows.name, name)),
      )
    const row = rows[0]
    return row === undefined ? undefined : rowToWorkflow(row)
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    await this.db
      .insert(workflows)
      .values({
        userId: this.userId,
        treeId: workflow.treeId,
        name: workflow.name,
        description: workflow.description,
        template: workflow.template,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      })
      .onConflictDoUpdate({
        target: [workflows.userId, workflows.treeId, workflows.name],
        set: {
          description: workflow.description,
          template: workflow.template,
          updatedAt: workflow.updatedAt,
        },
      })
  }

  async deleteWorkflow(treeId: string, name: string): Promise<void> {
    const result = await this.db
      .delete(workflows)
      .where(
        and(eq(workflows.userId, this.userId), eq(workflows.treeId, treeId), eq(workflows.name, name)),
      )
    if (result.rowCount === 0) {
      throw new Error(`workflow ${name} not found in tree ${treeId}`)
    }
  }
}

export class PostgresWorkflowStore implements WorkflowStore {
  constructor(private readonly db: Db) {}

  forUser(userId: string): WorkflowRepository {
    return new PostgresWorkflowRepository(this.db, userId)
  }
}
