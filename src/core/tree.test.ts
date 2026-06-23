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

const findIn = (node: ResolvedNode, id: string): ResolvedNode | undefined => {
  if (node.id === id) return node
  for (const child of node.children) {
    const hit = findIn(child, id)
    if (hit) return hit
  }
  return undefined
}

/** Finds a node by id anywhere in a resolved forest, or undefined. */
const find = (roots: ResolvedNode[], id: string): ResolvedNode | undefined => {
  for (const root of roots) {
    const hit = findIn(root, id)
    if (hit) return hit
  }
  return undefined
}

/** Like find, but throws when absent, so tests can read fields without a null guard. */
const get = (roots: ResolvedNode[], id: string): ResolvedNode => {
  const found = find(roots, id)
  if (!found) throw new Error(`node ${id} not found in resolved forest`)
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

  it('flags a root as protected and a deep leaf as not', () => {
    const chain = ['r', 'a', 'b', 'c', 'd', 'e']
    const nodes = chain.map((id, i) => node(id, i === 0 ? null : chain[i - 1]!))
    const tree = resolveTree(nodes, NOW)
    expect(get(tree, 'r').protected).toBe(true)
    expect(get(tree, 'e').protected).toBe(false)
  })

  it('allows several roots (a forest)', () => {
    const tree = resolveTree([node('r1', null), node('r2', null), node('a', 'r1')], NOW)
    expect(tree.map((root) => root.id).sort()).toEqual(['r1', 'r2'])
    expect(get(tree, 'a').depthFromRoot).toBe(1)
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
    const later = new Date('2027-01-01T00:00:00.000Z')
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
    expect(findIn(sub, 'b')).toBeTruthy()
    expect(findIn(sub, 'c')).toBeUndefined()
  })

  it('an empty tree resolves to an empty forest', () => {
    expect(resolveTree([], NOW)).toEqual([])
  })

  it('rejects a node with a missing parent', () => {
    expect(() => resolveTree([node('r', null), node('a', 'ghost')], NOW)).toThrow(/missing parent/)
  })

  it('rejects a disconnected component', () => {
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

describe('effectiveHardness rounding', () => {
  it('resolved node effectiveHardness has at most one decimal place', () => {
    // Use a non-trivial age so internal computation produces a float like 64.50022...
    const later = new Date('2026-07-01T00:00:00.000Z')
    const nodes = [
      node('r', null),
      node('a', 'r', { lastConfirmedAt: '2026-01-01T00:00:00.000Z' }),
      node('b', 'a', { lastConfirmedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const tree = resolveTree(nodes, later)
    for (const root of tree) {
      const check = (n: typeof root): void => {
        const decimals = (n.effectiveHardness.toString().split('.')[1] ?? '').length
        expect(decimals).toBeLessThanOrEqual(1)
        for (const child of n.children) check(child)
      }
      check(root)
    }
  })
})
