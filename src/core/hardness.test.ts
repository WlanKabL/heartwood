import { describe, it, expect } from 'vitest'
import { computeHardness } from './hardness.js'

const base = { descendantWeight: 0, hardnessSet: null, ageDays: 0 }

describe('computeHardness', () => {
  it('a node at a root is harder than a deep node', () => {
    const root = computeHardness({ ...base, depthFromRoot: 0 })
    const deep = computeHardness({ ...base, depthFromRoot: 5 })
    expect(root.effectiveHardness).toBeGreaterThan(deep.effectiveHardness)
  })

  it('a high hardnessSet cannot lift a deep node above its structural ceiling (the QR case)', () => {
    const deep = computeHardness({ ...base, depthFromRoot: 5, hardnessSet: 100 })
    expect(deep.effectiveHardness).toBeLessThanOrEqual(deep.ceiling)
    expect(deep.effectiveHardness).toBeLessThan(50)
  })

  it('more descendants harden a node at the same depth (load-bearing)', () => {
    const light = computeHardness({ ...base, depthFromRoot: 2, descendantWeight: 0 })
    const heavy = computeHardness({ ...base, depthFromRoot: 2, descendantWeight: 50 })
    expect(heavy.effectiveHardness).toBeGreaterThan(light.effectiveHardness)
  })

  it('age hardens a node (proven)', () => {
    const fresh = computeHardness({ ...base, depthFromRoot: 2, ageDays: 0 })
    const old = computeHardness({ ...base, depthFromRoot: 2, ageDays: 365 })
    expect(old.effectiveHardness).toBeGreaterThanOrEqual(fresh.effectiveHardness)
  })

  it('a low proposal can soften a node, but never below its structural floor', () => {
    const node = computeHardness({ ...base, depthFromRoot: 1, hardnessSet: 0 })
    expect(node.effectiveHardness).toBeGreaterThanOrEqual(node.floor)
  })

  it('effectiveHardness always stays within [floor, ceiling] and [0, 100]', () => {
    for (let depth = 0; depth <= 6; depth++) {
      const r = computeHardness({
        depthFromRoot: depth,
        descendantWeight: 10,
        hardnessSet: 100,
        ageDays: 1000,
      })
      expect(r.effectiveHardness).toBeGreaterThanOrEqual(r.floor)
      expect(r.effectiveHardness).toBeLessThanOrEqual(r.ceiling)
      expect(r.effectiveHardness).toBeGreaterThanOrEqual(0)
      expect(r.effectiveHardness).toBeLessThanOrEqual(100)
    }
  })

  it('clamp is none when no hardnessSet is provided', () => {
    const r = computeHardness({ depthFromRoot: 1, descendantWeight: 0, hardnessSet: null, ageDays: 0 })
    expect(r.clamp).toBe('none')
    expect(r.proposed).toBeNull()
  })

  it('clamp is raised-to-floor when a root is proposed a low hardnessSet (e.g. 20)', () => {
    // A root (depth 0) has a very high structural base (~100) and floor (~80).
    // Proposing 20 produces a raw value pulled DOWN by the set, but the floor clamp lifts it.
    const r = computeHardness({ depthFromRoot: 0, descendantWeight: 0, hardnessSet: 20, ageDays: 0 })
    expect(r.clamp).toBe('raised-to-floor')
    expect(r.proposed).toBe(20)
    expect(r.applied).toBeGreaterThanOrEqual(r.floor)
  })

  it('clamp is lowered-to-ceiling when a deep leaf is proposed a high hardnessSet (e.g. 100)', () => {
    // A deep leaf (depth 5) has a low ceiling. Proposing 100 gets pulled down.
    const r = computeHardness({ depthFromRoot: 5, descendantWeight: 0, hardnessSet: 100, ageDays: 0 })
    expect(r.clamp).toBe('lowered-to-ceiling')
    expect(r.proposed).toBe(100)
    expect(r.applied).toBeLessThanOrEqual(r.ceiling)
  })
})
