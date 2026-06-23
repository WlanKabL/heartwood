import type { TreeNode } from './types.js'

/**
 * Storage port for tree nodes. The core depends on this interface, not on a concrete
 * database, so SQLite, Postgres or an in-memory store are all drop-in. Async so that
 * a network-backed store (Postgres at multi-tenant) needs no signature change.
 */
export interface TreeRepository {
  listNodes(treeId: string): Promise<TreeNode[]>
  getNode(id: string): Promise<TreeNode | undefined>
  insertNode(node: TreeNode): Promise<void>
  updateNode(node: TreeNode): Promise<void>
  deleteNode(id: string): Promise<void>
  listTreeIds(): Promise<string[]>
}

/** In-memory implementation. Backs the unit tests and the repository contract suite. */
export class InMemoryTreeRepository implements TreeRepository {
  private readonly nodes = new Map<string, TreeNode>()

  async listNodes(treeId: string): Promise<TreeNode[]> {
    return [...this.nodes.values()].filter((node) => node.treeId === treeId)
  }

  async getNode(id: string): Promise<TreeNode | undefined> {
    return this.nodes.get(id)
  }

  async insertNode(node: TreeNode): Promise<void> {
    if (this.nodes.has(node.id)) throw new Error(`duplicate node id: ${node.id}`)
    this.nodes.set(node.id, { ...node })
  }

  async updateNode(node: TreeNode): Promise<void> {
    if (!this.nodes.has(node.id)) throw new Error(`unknown node id: ${node.id}`)
    this.nodes.set(node.id, { ...node })
  }

  async deleteNode(id: string): Promise<void> {
    if (!this.nodes.delete(id)) throw new Error(`unknown node id: ${id}`)
  }

  async listTreeIds(): Promise<string[]> {
    return [...new Set([...this.nodes.values()].map((node) => node.treeId))]
  }
}
