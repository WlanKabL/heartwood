import type { CascadePreview, CreateResult, ResolvedNode, UpdateResult } from '~/types/tree'

const enc = (s: string): string => encodeURIComponent(s)

export interface CreateNodeBody {
  parentId: string | null
  label: string
  content: string
  hardnessSet?: number | null
}
export interface UpdateNodeBody {
  content?: string
  label?: string
  hardnessSet?: number | null
  confirm?: boolean
}

export const createTreeNode = (treeId: string, body: CreateNodeBody): Promise<CreateResult> =>
  $fetch<CreateResult>(`/api/trees/${enc(treeId)}/nodes`, { method: 'POST', body })

export const updateTreeNode = (
  treeId: string,
  nodeId: string,
  body: UpdateNodeBody,
): Promise<UpdateResult | CascadePreview> =>
  $fetch<UpdateResult | CascadePreview>(`/api/trees/${enc(treeId)}/nodes/${enc(nodeId)}`, {
    method: 'PATCH',
    body,
  })

export const moveTreeNode = (
  treeId: string,
  nodeId: string,
  newParentId: string | null,
  confirm = false,
): Promise<ResolvedNode | CascadePreview> =>
  $fetch<ResolvedNode | CascadePreview>(`/api/trees/${enc(treeId)}/nodes/${enc(nodeId)}/move`, {
    method: 'POST',
    body: { newParentId, confirm },
  })

export const deleteTreeNode = (
  treeId: string,
  nodeId: string,
  confirm = false,
): Promise<{ deleted: string[] } | CascadePreview> =>
  $fetch<{ deleted: string[] } | CascadePreview>(
    `/api/trees/${enc(treeId)}/nodes/${enc(nodeId)}?confirm=${confirm}`,
    { method: 'DELETE' },
  )
