<script setup lang="ts">
import type { ResolvedNode } from '~/types/tree'
import { hardnessColor } from '~/types/tree'

const props = withDefaults(defineProps<{ forest: ResolvedNode[]; size?: number }>(), { size: 120 })

const CX = 60
const CY = 60
const ROOT_R = 30
const CHILD_R = 50
const TWO_PI = Math.PI * 2

interface Dot {
  x: number
  y: number
  r: number
  color: string
  protectedRing: boolean
}

const roots = computed(() =>
  props.forest.map((node, i) => {
    const a = (i / Math.max(props.forest.length, 1)) * TWO_PI - Math.PI / 2
    return { node, a, x: CX + Math.cos(a) * ROOT_R, y: CY + Math.sin(a) * ROOT_R }
  }),
)

const rootDots = computed<Dot[]>(() =>
  roots.value.map((r) => ({
    x: r.x,
    y: r.y,
    r: 4.5,
    color: hardnessColor(r.node.effectiveHardness),
    protectedRing: r.node.protected,
  })),
)

const childDots = computed<Dot[]>(() =>
  roots.value.flatMap((r) => {
    const kids = r.node.children
    return kids.map((k, j) => {
      const spread = 0.7
      const a = r.a + (kids.length > 1 ? (j / (kids.length - 1) - 0.5) * spread : 0)
      return {
        x: CX + Math.cos(a) * CHILD_R,
        y: CY + Math.sin(a) * CHILD_R,
        r: 2.6,
        color: hardnessColor(k.effectiveHardness),
        protectedRing: false,
      }
    })
  }),
)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 120 120" class="shrink-0" aria-hidden="true">
    <!-- faint growth rings -->
    <g fill="none" stroke="rgba(90,55,23,0.12)">
      <circle cx="60" cy="60" r="50" stroke-width="0.8" />
      <circle cx="60" cy="60" r="38" stroke-width="0.8" />
      <circle cx="60" cy="60" r="24" stroke-width="1" />
    </g>
    <!-- links core -> roots, roots -> children -->
    <g stroke="rgba(90,55,23,0.28)" stroke-width="0.8">
      <line v-for="(r, i) in roots" :key="`l${i}`" x1="60" y1="60" :x2="r.x" :y2="r.y" />
    </g>
    <!-- children -->
    <circle v-for="(d, i) in childDots" :key="`c${i}`" :cx="d.x" :cy="d.y" :r="d.r" :style="{ fill: d.color }" />
    <!-- roots -->
    <g v-for="(d, i) in rootDots" :key="`r${i}`">
      <circle
        v-if="d.protectedRing"
        :cx="d.x"
        :cy="d.y"
        :r="d.r + 2"
        fill="none"
        stroke="var(--color-amber)"
        stroke-width="1.2"
      />
      <circle :cx="d.x" :cy="d.y" :r="d.r" :style="{ fill: d.color }" />
    </g>
    <!-- core -->
    <circle cx="60" cy="60" r="6" fill="#2f1d0c" />
  </svg>
</template>
