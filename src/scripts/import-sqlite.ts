/**
 * One-off utility: import nodes and workflows from a legacy single-user SQLite
 * database into Postgres under a given userId.
 *
 * Usage:
 *   node --env-file=.env --import tsx src/scripts/import-sqlite.ts \
 *     --sqlite /path/to/heartwood.db --user <userId>
 *
 * The import is idempotent: re-running on the same source skips already-imported
 * records and reports them in the `skipped` count.
 */

import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { TreeNode } from '../core/types.js'
import type { Workflow } from '../core/workflow-repository.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { PostgresWorkflowStore } from '../storage/postgres-workflows.js'
import { createDb } from '../storage/db.js'
import type { Db } from '../storage/db.js'

// ── Legacy row schemas (mirrors sqlite.ts and sqlite-workflows.ts) ────────────

const NodeRowSchema = z.object({
  id: z.string(),
  tree_id: z.string(),
  parent_id: z.string().nullable(),
  label: z.string(),
  content: z.string(),
  hardness_set: z.number().nullable(),
  status: z.enum(['active', 'deprecated']),
  created_at: z.string(),
  updated_at: z.string(),
  last_confirmed_at: z.string(),
})

const WorkflowRowSchema = z.object({
  tree_id: z.string(),
  name: z.string(),
  description: z.string(),
  template: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

// ── Row → domain mappers ──────────────────────────────────────────────────────

const rowToNode = (row: unknown): TreeNode => {
  const r = NodeRowSchema.parse(row)
  return {
    id: r.id,
    treeId: r.tree_id,
    parentId: r.parent_id,
    label: r.label,
    content: r.content,
    hardnessSet: r.hardness_set,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastConfirmedAt: r.last_confirmed_at,
  }
}

const rowToWorkflow = (row: unknown): Workflow => {
  const r = WorkflowRowSchema.parse(row)
  return {
    treeId: r.tree_id,
    name: r.name,
    description: r.description,
    template: r.template,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ── Import result ─────────────────────────────────────────────────────────────

export interface ImportResult {
  nodes: number
  workflows: number
  skipped: number
}

// ── Core import function ──────────────────────────────────────────────────────

/**
 * Import all nodes and workflows from a legacy SQLite database into Postgres
 * under `userId`. Idempotent: existing records (matched by node id or workflow
 * (treeId, name)) are counted as skipped rather than causing an error.
 */
export const importSqlite = async (db: Db, sqlitePath: string, userId: string): Promise<ImportResult> => {
  const sqlite = new DatabaseSync(sqlitePath)

  try {
    const treeRepo = new PostgresTreeStore(db).forUser(userId)
    const workflowRepo = new PostgresWorkflowStore(db).forUser(userId)

    let insertedNodes = 0
    let insertedWorkflows = 0
    let skipped = 0

    // ── Nodes ─────────────────────────────────────────────────────────────────

    // Check whether the nodes table exists before querying it.
    const hasNodesTable = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'`)
      .get()

    if (hasNodesTable !== undefined) {
      const rawNodes = sqlite.prepare('SELECT * FROM nodes').all()
      for (const raw of rawNodes) {
        const node = rowToNode(raw)
        const existing = await treeRepo.getNode(node.id)
        if (existing !== undefined) {
          skipped++
          continue
        }
        await treeRepo.insertNode(node)
        insertedNodes++
      }
    }

    // ── Workflows ─────────────────────────────────────────────────────────────

    const hasWorkflowsTable = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='workflows'`)
      .get()

    if (hasWorkflowsTable !== undefined) {
      const rawWorkflows = sqlite.prepare('SELECT * FROM workflows').all()
      for (const raw of rawWorkflows) {
        const workflow = rowToWorkflow(raw)
        const existing = await workflowRepo.getWorkflow(workflow.treeId, workflow.name)
        if (existing !== undefined) {
          skipped++
          continue
        }
        await workflowRepo.saveWorkflow(workflow)
        insertedWorkflows++
      }
    }

    return { nodes: insertedNodes, workflows: insertedWorkflows, skipped }
  } finally {
    sqlite.close()
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

// Only run when invoked directly (not when imported by tests).
const isMain = process.argv[1]?.endsWith('import-sqlite.ts') || process.argv[1]?.endsWith('import-sqlite.js')

if (isMain) {
  const args = process.argv.slice(2)
  const sqliteIndex = args.indexOf('--sqlite')
  const userIndex = args.indexOf('--user')

  const sqlitePath = sqliteIndex !== -1 ? args[sqliteIndex + 1] : undefined
  const userId = userIndex !== -1 ? args[userIndex + 1] : undefined
  const databaseUrl = process.env['DATABASE_URL']

  if (!sqlitePath || !userId || !databaseUrl) {
    console.error('Usage: node --env-file=.env --import tsx src/scripts/import-sqlite.ts --sqlite <path> --user <userId>')
    console.error('  DATABASE_URL must be set in the environment (or .env file).')
    process.exit(1)
  }

  const { db, pool } = createDb(databaseUrl)

  importSqlite(db, sqlitePath, userId)
    .then(({ nodes, workflows, skipped }) => {
      console.log(`Import complete: ${nodes} nodes, ${workflows} workflows inserted, ${skipped} skipped.`)
    })
    .catch((err: unknown) => {
      console.error('Import failed:', err)
      process.exit(1)
    })
    .finally(() => {
      void pool.end()
    })
}
