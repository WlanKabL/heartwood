import { eq, and, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { TreeNode } from '../core/types.js'
import type { TreeStore, TreeRepository, TreeSummary } from '../core/repository.js'
import type { Db } from './db.js'
import { nodes } from './schema.js'

/** Drizzle wraps pg errors as `Error: Failed query...` with the pg error as `.cause`. */
const isDuplicateKeyError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false
  const cause = err.cause as { code?: string } | undefined
  if (cause?.code === '23505') return true
  // Fallback: check the stringified error chain.
  return /duplicate key|unique.*constraint/i.test(err.message)
}

const RowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  treeId: z.string(),
  parentId: z.string().nullable(),
  label: z.string(),
  content: z.string(),
  hardnessSet: z.number().nullable(),
  status: z.enum(['active', 'deprecated']),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastConfirmedAt: z.string(),
})

const rowToNode = (row: unknown): TreeNode => {
  const r = RowSchema.parse(row)
  return {
    id: r.id,
    treeId: r.treeId,
    parentId: r.parentId,
    label: r.label,
    content: r.content,
    hardnessSet: r.hardnessSet,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastConfirmedAt: r.lastConfirmedAt,
  }
}

class PostgresTreeRepository implements TreeRepository {
  constructor(
    private readonly db: Db,
    private readonly userId: string,
  ) {}

  async listNodes(treeId: string): Promise<TreeNode[]> {
    const rows = await this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, this.userId), eq(nodes.treeId, treeId)))
    return rows.map(rowToNode)
  }

  async getNode(id: string): Promise<TreeNode | undefined> {
    const rows = await this.db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, this.userId), eq(nodes.id, id)))
    const row = rows[0]
    return row === undefined ? undefined : rowToNode(row)
  }

  async insertNode(node: TreeNode): Promise<void> {
    try {
      await this.db.insert(nodes).values({
        id: node.id,
        userId: this.userId,
        treeId: node.treeId,
        parentId: node.parentId,
        label: node.label,
        content: node.content,
        hardnessSet: node.hardnessSet,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        lastConfirmedAt: node.lastConfirmedAt,
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new Error(`duplicate node id: ${node.id}`)
      throw error
    }
  }

  async updateNode(node: TreeNode): Promise<void> {
    const result = await this.db
      .update(nodes)
      .set({
        treeId: node.treeId,
        parentId: node.parentId,
        label: node.label,
        content: node.content,
        hardnessSet: node.hardnessSet,
        status: node.status,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        lastConfirmedAt: node.lastConfirmedAt,
      })
      .where(and(eq(nodes.userId, this.userId), eq(nodes.id, node.id)))
    if (result.rowCount === 0) throw new Error(`unknown node id: ${node.id}`)
  }

  async deleteNode(id: string): Promise<void> {
    const result = await this.db
      .delete(nodes)
      .where(and(eq(nodes.userId, this.userId), eq(nodes.id, id)))
    if (result.rowCount === 0) throw new Error(`unknown node id: ${id}`)
  }

  async listTreeIds(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ treeId: nodes.treeId })
      .from(nodes)
      .where(eq(nodes.userId, this.userId))
    return rows.map((r) => r.treeId)
  }

  async listTreeSummaries(): Promise<TreeSummary[]> {
    const rows = await this.db
      .select({ treeId: nodes.treeId, nodeCount: sql<number>`cast(count(*) as integer)` })
      .from(nodes)
      .where(eq(nodes.userId, this.userId))
      .groupBy(nodes.treeId)
    return rows.map((r) => ({ treeId: r.treeId, nodeCount: r.nodeCount }))
  }

  async deleteTree(treeId: string): Promise<number> {
    const result = await this.db
      .delete(nodes)
      .where(and(eq(nodes.userId, this.userId), eq(nodes.treeId, treeId)))
    return result.rowCount ?? 0
  }

  async searchNodes(treeId: string, query: string): Promise<TreeNode[]> {
    const pattern = `%${query}%`
    const rows = await this.db
      .select()
      .from(nodes)
      .where(
        and(
          eq(nodes.userId, this.userId),
          eq(nodes.treeId, treeId),
          or(ilike(nodes.label, pattern), ilike(nodes.content, pattern)),
        ),
      )
    return rows.map(rowToNode)
  }
}

export class PostgresTreeStore implements TreeStore {
  constructor(private readonly db: Db) {}

  forUser(userId: string): TreeRepository {
    return new PostgresTreeRepository(this.db, userId)
  }
}
