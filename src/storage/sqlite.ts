import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { TreeNode } from '../core/types.js'
import type { TreeRepository } from '../core/repository.js'

const SCHEMA = `
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
CREATE INDEX IF NOT EXISTS idx_nodes_tree ON nodes (tree_id);
`

const RowSchema = z.object({
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

/** Maps a raw DB row (snake_case) to a validated TreeNode. Throws on a malformed row. */
const rowToNode = (row: unknown): TreeNode => {
  const r = RowSchema.parse(row)
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

const TreeIdRow = z.object({ tree_id: z.string() })

/** SQLite-backed repository using Node's built-in node:sqlite (synchronous, no native build). */
export class SqliteTreeRepository implements TreeRepository {
  private readonly db: DatabaseSync

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
  }

  async listNodes(treeId: string): Promise<TreeNode[]> {
    return this.db.prepare('SELECT * FROM nodes WHERE tree_id = ?').all(treeId).map(rowToNode)
  }

  async getNode(id: string): Promise<TreeNode | undefined> {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id)
    return row === undefined ? undefined : rowToNode(row)
  }

  async insertNode(node: TreeNode): Promise<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO nodes
             (id, tree_id, parent_id, label, content, hardness_set, status, created_at, updated_at, last_confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          node.id,
          node.treeId,
          node.parentId,
          node.label,
          node.content,
          node.hardnessSet,
          node.status,
          node.createdAt,
          node.updatedAt,
          node.lastConfirmedAt,
        )
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint/i.test(error.message)) {
        throw new Error(`duplicate node id: ${node.id}`)
      }
      throw error
    }
  }

  async updateNode(node: TreeNode): Promise<void> {
    const result = this.db
      .prepare(
        `UPDATE nodes SET
           tree_id = ?, parent_id = ?, label = ?, content = ?, hardness_set = ?,
           status = ?, created_at = ?, updated_at = ?, last_confirmed_at = ?
         WHERE id = ?`,
      )
      .run(
        node.treeId,
        node.parentId,
        node.label,
        node.content,
        node.hardnessSet,
        node.status,
        node.createdAt,
        node.updatedAt,
        node.lastConfirmedAt,
        node.id,
      )
    if (Number(result.changes) === 0) throw new Error(`unknown node id: ${node.id}`)
  }

  async deleteNode(id: string): Promise<void> {
    const result = this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id)
    if (Number(result.changes) === 0) throw new Error(`unknown node id: ${id}`)
  }

  async listTreeIds(): Promise<string[]> {
    return this.db
      .prepare('SELECT DISTINCT tree_id FROM nodes')
      .all()
      .map((row) => TreeIdRow.parse(row).tree_id)
  }

  close(): void {
    this.db.close()
  }
}
