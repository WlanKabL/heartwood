import { describe, it, expect } from 'vitest'
import { computeHardness } from './hardness.js'

const base = { descendantWeight: 0, hardnessSet: null, ageDays: 0 }

describe('computeHardness', () => {
  it('a root (depth 0) is harder than a deep leaf', () => {
    const root = computeHardness({ ...base, depthFromRoot: 0 })
    const leaf = computeHardness({ ...base, depthFromRoot: 5 })
    expect(root.effectiveHardness).toBeGreaterThan(leaf.effectiveHardness)
  })

  it('bands map depth to the expected layer', () => {
    expect(computeHardness({ ...base, depthFromRoot: 0 }).band).toBe('root')
    expect(computeHardness({ ...base, depthFromRoot: 5 }).band).toBe('leaf')
  })

  it('a high hardnessSet cannot lift a leaf above its structural ceiling (the QR case)', () => {
    const leaf = computeHardness({ ...base, depthFromRoot: 5, hardnessSet: 100 })
    expect(leaf.effectiveHardness).toBeLessThanOrEqual(leaf.ceiling)
    expect(leaf.band).not.toBe('root')
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
})
