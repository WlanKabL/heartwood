import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Workflow, WorkflowRepository } from '../core/workflow-repository.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workflows (
  tree_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  template TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tree_id, name)
);
`

const RowSchema = z.object({
  tree_id: z.string(),
  name: z.string(),
  description: z.string(),
  template: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

const rowToWorkflow = (row: unknown): Workflow => {
  const r = RowSchema.parse(row)
  return {
    treeId: r.tree_id,
    name: r.name,
    description: r.description,
    template: r.template,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** SQLite-backed workflow store. Shares the database file with the node store. */
export class SqliteWorkflowRepository implements WorkflowRepository {
  private readonly db: DatabaseSync

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
  }

  async listWorkflows(treeId: string): Promise<Workflow[]> {
    return this.db.prepare('SELECT * FROM workflows WHERE tree_id = ?').all(treeId).map(rowToWorkflow)
  }

  async getWorkflow(treeId: string, name: string): Promise<Workflow | undefined> {
    const row = this.db.prepare('SELECT * FROM workflows WHERE tree_id = ? AND name = ?').get(treeId, name)
    return row === undefined ? undefined : rowToWorkflow(row)
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO workflows (tree_id, name, description, template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tree_id, name) DO UPDATE SET
           description = excluded.description,
           template = excluded.template,
           updated_at = excluded.updated_at`,
      )
      .run(
        workflow.treeId,
        workflow.name,
        workflow.description,
        workflow.template,
        workflow.createdAt,
        workflow.updatedAt,
      )
  }

  async deleteWorkflow(treeId: string, name: string): Promise<void> {
    const result = this.db.prepare('DELETE FROM workflows WHERE tree_id = ? AND name = ?').run(treeId, name)
    if (Number(result.changes) === 0) throw new Error(`workflow ${name} not found in tree ${treeId}`)
  }

  close(): void {
    this.db.close()
  }
}
