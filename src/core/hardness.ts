import type { HardnessInput, HardnessResult } from './types.js'

/**
 * Hardness algorithm.
 *
 * Structure is the backbone AND the ceiling. `hardnessSet` and `proven` may only
 * modulate WITHIN the structurally allowed band. A single high source (e.g. an AI
 * proposing 100 for a leaf) can never win. The server, not the prompt, decides what
 * is hard.
 *
 * Output is a single number plus a protection flag. There is no level label: position
 * lives in depthFromRoot, hardness lives in the number, and they are not the same thing.
 *
 * Constants are v1 and tunable; behaviour is pinned by tests, exact numbers are free.
 */

/** At or above this effective hardness a node is protected: changing it needs explicit human confirmation. */
export const PROTECTION_THRESHOLD = 60

const CLOSENESS_DECAY = 0.7 // each level away from the root keeps 70% of closeness
const DESCENDANT_BONUS_CAP = 25 // load-bearing can add at most this much
const DESCENDANT_BONUS_SCALE = 8
const HEADROOM = 15 // how far proposal/age may push above structuralBase
const FLOOR_FACTOR = 0.8 // load-bearing nodes never fall below 80% of their weight
const PROVEN_CAP = 15 // age can add at most this much
const PROVEN_PER_DAY = 0.1 // ~150 days to fully harden
const SET_INFLUENCE = 0.5 // how strongly a (clamped) proposal nudges

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const closeness = (depthFromRoot: number): number =>
  100 * CLOSENESS_DECAY ** Math.max(0, depthFromRoot)

const descendantBonus = (descendantWeight: number): number =>
  Math.min(DESCENDANT_BONUS_CAP, DESCENDANT_BONUS_SCALE * Math.log2(1 + Math.max(0, descendantWeight)))

const provenBonus = (ageDays: number): number =>
  Math.min(PROVEN_CAP, Math.max(0, ageDays) * PROVEN_PER_DAY)

/**
 * Computes effective hardness. structuralBase comes from topology (closeness to a root
 * plus load-bearing weight) and defines both the floor and the ceiling. The proposal is
 * clamped into the band before it can nudge; age adds a bounded bonus.
 */
export const computeHardness = (input: HardnessInput): HardnessResult => {
  const structuralBase = Math.min(
    100,
    closeness(input.depthFromRoot) + descendantBonus(input.descendantWeight),
  )
  const ceiling = Math.min(100, structuralBase + HEADROOM)
  const floor = structuralBase * FLOOR_FACTOR

  let raw = structuralBase + provenBonus(input.ageDays)
  const proposed: number | null = input.hardnessSet ?? null

  if (input.hardnessSet !== null) {
    const setClamped = clamp(input.hardnessSet, 0, ceiling)
    raw += (setClamped - structuralBase) * SET_INFLUENCE
  }

  const rawBeforeFinalClamp = raw
  const effectiveHardness = clamp(raw, floor, ceiling)

  // Determine how the proposal was treated:
  // - 'lowered-to-ceiling': the proposal exceeded the structural ceiling and was pulled down
  //   (the setClamped step already applied this, before the final floor/ceiling clamp).
  // - 'raised-to-floor': the final clamp pushed the blended value UP to the floor.
  // - 'none': the proposal fit in the band, or no proposal was given.
  let clampKind: 'none' | 'raised-to-floor' | 'lowered-to-ceiling' = 'none'
  if (proposed !== null) {
    if (proposed > ceiling) {
      clampKind = 'lowered-to-ceiling'
    } else if (effectiveHardness > rawBeforeFinalClamp) {
      clampKind = 'raised-to-floor'
    }
  }

  return { structuralBase, floor, ceiling, effectiveHardness, clamp: clampKind, proposed, applied: effectiveHardness }
}
