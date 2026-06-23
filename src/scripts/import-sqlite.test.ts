import { describe, it, expect, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync, existsSync } from 'node:fs'
import { setupPostgresTests, getDb, getUserA } from '../storage/postgres-test-setup.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { PostgresWorkflowStore } from '../storage/postgres-workflows.js'
import { importSqlite } from './import-sqlite.js'

setupPostgresTests()

const STAMP = '2026-01-01T00:00:00.000Z'
const TEMP_DB_PATH = join(tmpdir(), `heartwood-import-test-${process.pid}.db`)

/** Create a fresh legacy SQLite file with the given nodes and workflows. */
const createLegacySqlite = (
  path: string,
  nodes: Array<{
    id: string
    tree_id: string
    parent_id: string | null
    label: string
    content: string
    hardness_set: number | null
    status: 'active' | 'deprecated'
    created_at: string
    updated_at: string
    last_confirmed_at: string
  }>,
  workflowsData: Array<{
    tree_id: string
    name: string
    description: string
    template: string
    created_at: string
    updated_at: string
  }>,
): void => {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      tree_id TEXT NOT NULL,
      parent_id TEXT,
      label TEXT NOT NULL,
      content TEXT NOT NULL,
      hardness_set INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_confirmed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflows (
      tree_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      template TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tree_id, name)
    );
  `)

  const insertNode = db.prepare(
    `INSERT INTO nodes (id, tree_id, parent_id, label, content, hardness_set, status, created_at, updated_at, last_confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const n of nodes) {
    insertNode.run(n.id, n.tree_id, n.parent_id, n.label, n.content, n.hardness_set, n.status, n.created_at, n.updated_at, n.last_confirmed_at)
  }

  const insertWorkflow = db.prepare(
    `INSERT INTO workflows (tree_id, name, description, template, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const w of workflowsData) {
    insertWorkflow.run(w.tree_id, w.name, w.description, w.template, w.created_at, w.updated_at)
  }

  db.close()
}

afterEach(() => {
  if (existsSync(TEMP_DB_PATH)) {
    rmSync(TEMP_DB_PATH)
  }
})

describe('importSqlite', () => {
  it('imports 3 nodes and 1 workflow on first run', async () => {
    createLegacySqlite(
      TEMP_DB_PATH,
      [
        {
          id: 'node-1',
          tree_id: 'keeperlog',
          parent_id: null,
          label: 'root',
          content: 'The root truth',
          hardness_set: null,
          status: 'active',
          created_at: STAMP,
          updated_at: STAMP,
          last_confirmed_at: STAMP,
        },
        {
          id: 'node-2',
          tree_id: 'keeperlog',
          parent_id: 'node-1',
          label: 'identity',
          content: 'Our identity truth',
          hardness_set: 80,
          status: 'active',
          created_at: STAMP,
          updated_at: STAMP,
          last_confirmed_at: STAMP,
        },
        {
          id: 'node-3',
          tree_id: 'keeperlog',
          parent_id: 'node-1',
          label: 'deprecated-truth',
          content: 'An old truth',
          hardness_set: null,
          status: 'deprecated',
          created_at: STAMP,
          updated_at: STAMP,
          last_confirmed_at: STAMP,
        },
      ],
      [
        {
          tree_id: 'keeperlog',
          name: 'review-sprint',
          description: 'Sprint review workflow',
          template: 'Review: {{truths}}',
          created_at: STAMP,
          updated_at: STAMP,
        },
      ],
    )

    const db = getDb()
    const userA = getUserA()

    const result = await importSqlite(db, TEMP_DB_PATH, userA)

    expect(result).toEqual({ nodes: 3, workflows: 1, skipped: 0 })

    // Verify nodes landed in Postgres under userA
    const treeRepo = new PostgresTreeStore(db).forUser(userA)
    const pgNodes = await treeRepo.listNodes('keeperlog')
    expect(pgNodes).toHaveLength(3)
    const ids = pgNodes.map((n) => n.id).sort()
    expect(ids).toEqual(['node-1', 'node-2', 'node-3'])

    // Verify field mapping is correct (hardnessSet, status, timestamps)
    const node2 = pgNodes.find((n) => n.id === 'node-2')
    expect(node2?.hardnessSet).toBe(80)
    expect(node2?.parentId).toBe('node-1')
    expect(node2?.treeId).toBe('keeperlog')
    expect(node2?.createdAt).toBe(STAMP)

    const node3 = pgNodes.find((n) => n.id === 'node-3')
    expect(node3?.status).toBe('deprecated')
    expect(node3?.hardnessSet).toBeNull()

    // Verify workflow landed
    const workflowRepo = new PostgresWorkflowStore(db).forUser(userA)
    const wf = await workflowRepo.getWorkflow('keeperlog', 'review-sprint')
    expect(wf).toBeDefined()
    expect(wf?.template).toBe('Review: {{truths}}')
    expect(wf?.createdAt).toBe(STAMP)
  })

  it('is idempotent: second run skips all and inserts nothing new', async () => {
    createLegacySqlite(
      TEMP_DB_PATH,
      [
        {
          id: 'node-a',
          tree_id: 'keeperlog',
          parent_id: null,
          label: 'root',
          content: 'Root',
          hardness_set: null,
          status: 'active',
          created_at: STAMP,
          updated_at: STAMP,
          last_confirmed_at: STAMP,
        },
        {
          id: 'node-b',
          tree_id: 'keeperlog',
          parent_id: 'node-a',
          label: 'child',
          content: 'Child',
          hardness_set: 50,
          status: 'active',
          created_at: STAMP,
          updated_at: STAMP,
          last_confirmed_at: STAMP,
        },
        {
          id: 'node-c',
          tree_id: 'keeperlog',
          parent_id: 'node-a',
          label: 'another',
          content: 'Another',
          hardness_set: null,
          status: 'deprecated',
          created_at: STAMP,
          updated_at: STAMP,
          last_confirmed_at: STAMP,
        },
      ],
      [
        {
          tree_id: 'keeperlog',
          name: 'my-workflow',
          description: 'A workflow',
          template: 'Do: {{truths}}',
          created_at: STAMP,
          updated_at: STAMP,
        },
      ],
    )

    const db = getDb()
    const userA = getUserA()

    // First run
    const first = await importSqlite(db, TEMP_DB_PATH, userA)
    expect(first).toEqual({ nodes: 3, workflows: 1, skipped: 0 })

    // Second run — must skip everything
    const second = await importSqlite(db, TEMP_DB_PATH, userA)
    expect(second).toEqual({ nodes: 0, workflows: 0, skipped: 4 })

    // Postgres still has exactly 3 nodes (nothing duplicated)
    const treeRepo = new PostgresTreeStore(db).forUser(userA)
    const pgNodes = await treeRepo.listNodes('keeperlog')
    expect(pgNodes).toHaveLength(3)
  })
})
