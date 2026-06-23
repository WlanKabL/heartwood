import { describe, it, expect } from 'vitest'
import type { TreeNode, ResolvedNode } from './types.js'
import { resolveTree, resolveSubtree, ageDaysBetween } from './tree.js'

const STAMP = '2026-01-01T00:00:00.000Z'
const NOW = new Date(STAMP) // same as lastConfirmedAt → ageDays 0 by default

const node = (id: string, parentId: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  treeId: 't1',
  parentId,
  label: id,
  content: `content ${id}`,
  hardnessSet: null,
  status: 'active',
  createdAt: STAMP,
  updatedAt: STAMP,
  lastConfirmedAt: STAMP,
  ...extra,
})

/** Finds a node by id anywhere in a resolved tree, or undefined. */
const find = (root: ResolvedNode | null, id: string): ResolvedNode | undefined => {
  if (!root) return undefined
  if (root.id === id) return root
  for (const child of root.children) {
    const hit = find(child, id)
    if (hit) return hit
  }
  return undefined
}

/** Like find, but throws when absent, so tests can read fields without a null guard. */
const get = (root: ResolvedNode | null, id: string): ResolvedNode => {
  const found = find(root, id)
  if (!found) throw new Error(`node ${id} not found in resolved tree`)
  return found
}

describe('buildTree / resolveTree', () => {
  it('computes depth from the root', () => {
    const tree = resolveTree([node('r', null), node('a', 'r'), node('b', 'a')], NOW)
    expect(get(tree, 'r').depthFromRoot).toBe(0)
    expect(get(tree, 'a').depthFromRoot).toBe(1)
    expect(get(tree, 'b').depthFromRoot).toBe(2)
  })

  it('computes descendant weight (root carries everything, a leaf carries nothing)', () => {
    const tree = resolveTree([node('r', null), node('a', 'r'), node('b', 'a')], NOW)
    expect(get(tree, 'r').descendantWeight).toBe(2)
    expect(get(tree, 'a').descendantWeight).toBe(1)
    expect(get(tree, 'b').descendantWeight).toBe(0)
  })

  it('a root resolves to the root band and a deep leaf to the leaf band', () => {
    const chain = ['r', 'a', 'b', 'c', 'd', 'e']
    const nodes = chain.map((id, i) => node(id, i === 0 ? null : chain[i - 1]!))
    const tree = resolveTree(nodes, NOW)
    expect(get(tree, 'r').band).toBe('root')
    expect(get(tree, 'e').band).toBe('leaf')
  })

  it('a load-bearing node is harder than a childless sibling at the same depth', () => {
    const nodes = [
      node('r', null),
      node('heavy', 'r'),
      node('light', 'r'),
      node('h1', 'heavy'),
      node('h2', 'heavy'),
      node('h3', 'heavy'),
    ]
    const tree = resolveTree(nodes, NOW)
    expect(get(tree, 'heavy').effectiveHardness).toBeGreaterThan(get(tree, 'light').effectiveHardness)
  })

  it('an older node is harder than a fresh sibling (proven)', () => {
    const later = new Date('2027-01-01T00:00:00.000Z') // one year after the stamps
    const nodes = [
      node('r', null),
      node('fresh', 'r', { lastConfirmedAt: '2027-01-01T00:00:00.000Z' }),
      node('old', 'r', { lastConfirmedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const tree = resolveTree(nodes, later)
    expect(get(tree, 'old').effectiveHardness).toBeGreaterThan(get(tree, 'fresh').effectiveHardness)
  })

  it('resolveSubtree returns only the requested subtree', () => {
    const nodes = [node('r', null), node('a', 'r'), node('b', 'a'), node('c', 'r')]
    const sub = resolveSubtree(nodes, 'a', NOW)
    expect(sub.id).toBe('a')
    expect(find(sub, 'b')).toBeTruthy()
    expect(find(sub, 'c')).toBeUndefined()
  })

  it('an empty tree resolves to null', () => {
    expect(resolveTree([], NOW)).toBeNull()
  })

  it('rejects more than one root', () => {
    expect(() => resolveTree([node('r1', null), node('r2', null)], NOW)).toThrow(/exactly one root/)
  })

  it('rejects a node with a missing parent', () => {
    expect(() => resolveTree([node('r', null), node('a', 'ghost')], NOW)).toThrow(/missing parent/)
  })

  it('rejects a disconnected component', () => {
    // x and y point at each other: no root reaches them
    const nodes = [node('r', null), node('x', 'y'), node('y', 'x')]
    expect(() => resolveTree(nodes, NOW)).toThrow()
  })

  it('rejects duplicate ids', () => {
    expect(() => resolveTree([node('r', null), node('r', 'r')], NOW)).toThrow(/duplicate/)
  })
})

describe('ageDaysBetween', () => {
  it('returns the day delta and never goes negative', () => {
    expect(ageDaysBetween('2026-01-01T00:00:00.000Z', new Date('2026-01-11T00:00:00.000Z'))).toBe(10)
    expect(ageDaysBetween('2026-01-11T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(0)
  })
})
