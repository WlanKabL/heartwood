/**
 * Core domain types for the Heartwood truth tree.
 * A node's stored fields are explicit; its hardness is always derived server-side.
 * A tree may have several roots (a forest); each root is its own depth-0 strand.
 */

export type NodeStatus = 'active' | 'deprecated'

/** A single truth in a project's tree. Stored as-is; hardness is never stored. */
export interface TreeNode {
  id: string
  treeId: string
  parentId: string | null // null = a root of the tree (several roots are allowed)
  label: string // short name, e.g. "identity", "voice", "qr-handover"
  content: string // the actual truth
  hardnessSet: number | null // 0-100, human/AI *proposal*; null = derive only
  status: NodeStatus
  createdAt: string
  updatedAt: string
  lastConfirmedAt: string // resets on edit; feeds the "proven" source
}

/** Everything the hardness algorithm needs, decoupled from storage. */
export interface HardnessInput {
  depthFromRoot: number // distance to this node's root (0 = a root)
  descendantWeight: number // how much hangs below the node (load-bearing measure)
  hardnessSet: number | null // the proposal
  ageDays: number // days since lastConfirmedAt
}

export interface HardnessResult {
  structuralBase: number // the topology-derived backbone
  floor: number
  ceiling: number
  effectiveHardness: number
}

/** A node enriched with its computed position and hardness, the view an agent receives. */
export interface ResolvedNode {
  id: string
  treeId: string
  parentId: string | null
  label: string
  content: string
  status: NodeStatus
  depthFromRoot: number
  descendantWeight: number
  effectiveHardness: number
  protected: boolean // effectiveHardness >= PROTECTION_THRESHOLD: do not change without human confirmation
  children: ResolvedNode[]
}
