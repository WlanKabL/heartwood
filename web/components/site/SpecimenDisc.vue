<script setup lang="ts">
interface Callout {
  label: string
  meta: string
  angle: number
}

withDefaults(defineProps<{ callouts?: Callout[] }>(), {
  callouts: () => [
    { label: 'identity', meta: 'ROOT · 92 · protected', angle: -34 },
    { label: 'voice', meta: '81 · protected', angle: -10 },
    { label: 'audiences', meta: '58', angle: 14 },
    { label: 'qr-handover', meta: 'LEAF · 34', angle: 42 },
  ],
})

// Unique gradient id per instance so multiple discs on one page never collide.
const gradId = `hw-wood-${useId()}`

const rings = [98, 84, 68, 50, 32, 16]

const pt = (angle: number, r: number): { x: number; y: number } => {
  const a = (angle * Math.PI) / 180
  return { x: 120 + Math.cos(a) * r, y: 120 + Math.sin(a) * r }
}
</script>

<template>
  <svg
    viewBox="0 0 372 240"
    class="h-auto w-full"
    role="img"
    aria-label="Heartwood growth-ring specimen, annotated with node hardness"
  >
    <defs>
      <radialGradient :id="gradId" cx="42%" cy="46%" r="60%">
        <stop offset="0%" stop-color="#4a2c12" />
        <stop offset="34%" stop-color="#7c4f24" />
        <stop offset="68%" stop-color="#b88a4e" />
        <stop offset="100%" stop-color="#ecdcb8" />
      </radialGradient>
    </defs>

    <!-- paper mount + wood disc -->
    <circle cx="120" cy="120" r="118" fill="#efe6d6" />
    <circle cx="120" cy="120" r="110" :fill="`url(#${gradId})`" />

    <!-- growth rings, denser toward the core -->
    <g fill="none" stroke="#2c1a0b" stroke-opacity="0.32">
      <circle
        v-for="r in rings"
        :key="r"
        cx="120"
        cy="120"
        :r="r"
        :stroke-width="(120 - r) / 30 + 1"
      />
    </g>

    <!-- core node -->
    <circle cx="120" cy="120" r="5" fill="#efe6d6" />

    <!-- hairline callouts into the right gutter -->
    <g v-for="(c, i) in callouts" :key="c.label">
      <line
        :x1="pt(c.angle, 16).x"
        :y1="pt(c.angle, 16).y"
        x2="248"
        :y2="58 + i * 44"
        stroke="#7a6346"
        stroke-width="1"
      />
      <circle :cx="pt(c.angle, 16).x" :cy="pt(c.angle, 16).y" r="2.4" fill="#efe6d6" />
      <text
        x="256"
        :y="55 + i * 44"
        font-family="JetBrains Mono"
        font-size="11"
        font-weight="600"
        fill="#2c2118"
      >
        {{ c.label }}
      </text>
      <text x="256" :y="69 + i * 44" font-family="JetBrains Mono" font-size="9" fill="#9a5418">
        {{ c.meta }}
      </text>
    </g>
  </svg>
</template>
