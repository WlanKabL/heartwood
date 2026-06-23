import type { TreeNode } from './types.js'

/**
 * Factory: hands out a TreeRepository already scoped to one tenant. The caller
 * obtains a view via forUser(userId) and then operates on it without ever
 * passing a userId again — cross-tenant access is structurally impossible.
 */
export interface TreeStore {
  forUser(userId: string): TreeRepository
}

/**
 * Storage port for tree nodes. The core depends on this interface, not on a concrete
 * database, so SQLite, Postgres or an in-memory store are all drop-in. Async so that
 * a network-backed store (Postgres at multi-tenant) needs no signature change.
 *
 * Every instance is already bound to a single user. Callers never pass userId;
 * the implementation stamps ownership on insert and filters every read/write by it.
 */
export interface TreeSummary {
  treeId: string
  nodeCount: number
}

export interface TreeRepository {
  listNodes(treeId: string): Promise<TreeNode[]>
  getNode(id: string): Promise<TreeNode | undefined>
  insertNode(node: TreeNode): Promise<void>
  updateNode(node: TreeNode): Promise<void>
  deleteNode(id: string): Promise<void>
  listTreeIds(): Promise<string[]>
  /** Summaries for all trees owned by the bound user: treeId + node count. */
  listTreeSummaries(): Promise<TreeSummary[]>
  /** Delete every node in a tree for the bound user. Returns the number removed. */
  deleteTree(treeId: string): Promise<number>
  /** Case-insensitive substring search across label + content for the bound user in one tree. */
  searchNodes(treeId: string, query: string): Promise<TreeNode[]>
}

/**
 * One user's view into the shared InMemory store. Ownership is tracked by userId;
 * every method filters or guards by it. Two users can both have a tree named
 * "keeperlog" without collision — they never see each other's nodes.
 */
class BoundInMemoryTreeRepository implements TreeRepository {
  constructor(
    private readonly store: Map<string, { userId: string; node: TreeNode }>,
    private readonly userId: string,
  ) {}

  async listNodes(treeId: string): Promise<TreeNode[]> {
    return [...this.store.values()]
      .filter((entry) => entry.userId === this.userId && entry.node.treeId === treeId)
      .map((entry) => entry.node)
  }

  async getNode(id: string): Promise<TreeNode | undefined> {
    const entry = this.store.get(id)
    if (!entry || entry.userId !== this.userId) return undefined
    return entry.node
  }

  async insertNode(node: TreeNode): Promise<void> {
    if (this.store.has(node.id)) throw new Error(`duplicate node id: ${node.id}`)
    this.store.set(node.id, { userId: this.userId, node: { ...node } })
  }

  async updateNode(node: TreeNode): Promise<void> {
    const entry = this.store.get(node.id)
    if (!entry || entry.userId !== this.userId) throw new Error(`unknown node id: ${node.id}`)
    this.store.set(node.id, { userId: this.userId, node: { ...node } })
  }

  async deleteNode(id: string): Promise<void> {
    const entry = this.store.get(id)
    if (!entry || entry.userId !== this.userId) throw new Error(`unknown node id: ${id}`)
    this.store.delete(id)
  }

  async listTreeIds(): Promise<string[]> {
    return [
      ...new Set(
        [...this.store.values()]
          .filter((entry) => entry.userId === this.userId)
          .map((entry) => entry.node.treeId),
      ),
    ]
  }

  async listTreeSummaries(): Promise<TreeSummary[]> {
    const counts = new Map<string, number>()
    for (const entry of this.store.values()) {
      if (entry.userId !== this.userId) continue
      counts.set(entry.node.treeId, (counts.get(entry.node.treeId) ?? 0) + 1)
    }
    return [...counts.entries()].map(([treeId, nodeCount]) => ({ treeId, nodeCount }))
  }

  async deleteTree(treeId: string): Promise<number> {
    let removed = 0
    for (const [key, entry] of this.store.entries()) {
      if (entry.userId === this.userId && entry.node.treeId === treeId) {
        this.store.delete(key)
        removed++
      }
    }
    return removed
  }

  async searchNodes(treeId: string, query: string): Promise<TreeNode[]> {
    const q = query.toLowerCase()
    return [...this.store.values()]
      .filter(
        (entry) =>
          entry.userId === this.userId &&
          entry.node.treeId === treeId &&
          (entry.node.label.toLowerCase().includes(q) || entry.node.content.toLowerCase().includes(q)),
      )
      .map((entry) => entry.node)
  }
}

/** In-memory store. Backs the unit tests and the repository contract suite. */
export class InMemoryTreeStore implements TreeStore {
  private readonly store = new Map<string, { userId: string; node: TreeNode }>()

  forUser(userId: string): TreeRepository {
    return new BoundInMemoryTreeRepository(this.store, userId)
  }
}
