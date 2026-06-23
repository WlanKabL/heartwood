export interface TreeSummary {
  treeId: string
  nodeCount: number
}

export type NodeStatus = 'active' | 'deprecated'

/** The resolved, hardness-enriched node shape returned by the read API. */
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
  protected: boolean
  children: ResolvedNode[]
}

export interface ApiToken {
  id: string
  name: string
  prefix: string
  createdAt?: string
  lastUsedAt?: string | null
}

/** Maps a 0-100 hardness onto the walnut ramp tokens defined in main.css. */
export const hardnessColor = (h: number): string => {
  if (h >= 85) return 'var(--color-h-4)'
  if (h >= 65) return 'var(--color-h-3)'
  if (h >= 45) return 'var(--color-h-2)'
  if (h >= 30) return 'var(--color-h-1)'
  return 'var(--color-h-0)'
}
