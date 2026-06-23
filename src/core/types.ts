/**
 * Core domain types for the Heartwood truth tree.
 * A node's stored fields are explicit; its hardness is always derived server-side.
 */

export type NodeStatus = 'active' | 'deprecated'

/** A single truth in a project's tree. Stored as-is; hardness is never stored. */
export interface TreeNode {
  id: string
  treeId: string
  parentId: string | null // null = the single root of the tree
  label: string // short name, e.g. "identity", "voice", "qr-handover"
  content: string // the actual truth
  hardnessSet: number | null // 0-100, human/AI *proposal*; null = derive only
  status: NodeStatus
  createdAt: string
  updatedAt: string
  lastConfirmedAt: string // resets on edit; feeds the "proven" source
}

export type HardnessBand = 'leaf' | 'branch' | 'trunk' | 'root'

/** Everything the hardness algorithm needs, decoupled from storage. */
export interface HardnessInput {
  depthFromRoot: number // distance to the root (0 = root)
  descendantWeight: number // how much hangs below the node (load-bearing measure)
  hardnessSet: number | null // the clamped-to-band proposal
  ageDays: number // days since lastConfirmedAt
}

export interface HardnessResult {
  structuralBase: number // the topology-derived backbone
  floor: number
  ceiling: number
  effectiveHardness: number
  band: HardnessBand
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
  band: HardnessBand
  children: ResolvedNode[]
}
