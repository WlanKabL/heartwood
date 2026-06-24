<script setup lang="ts">
import type { ResolvedNode } from '~/types/tree'
import { hardnessColor } from '~/types/tree'

defineProps<{ nodes: ResolvedNode[]; depth?: number; selectedId?: string | null }>()
const emit = defineEmits<{ select: [node: ResolvedNode] }>()
</script>

<template>
  <ul class="space-y-1">
    <li v-for="node in nodes" :key="node.id">
      <div
        class="group flex cursor-pointer items-start gap-3 rounded-sm border px-2 py-2 transition-colors"
        :class="
          node.id === selectedId
            ? 'border-ink bg-paper-2'
            : 'border-transparent hover:border-line hover:bg-paper-2'
        "
        :style="{ marginLeft: `${(depth ?? 0) * 1.4}rem` }"
        role="button"
        tabindex="0"
        :aria-pressed="node.id === selectedId"
        @click="emit('select', node)"
        @keydown.enter.prevent="emit('select', node)"
        @keydown.space.prevent="emit('select', node)"
      >
        <span
          class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          :style="{ background: hardnessColor(node.effectiveHardness) }"
          :title="`hardness ${node.effectiveHardness}`"
        ></span>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="font-mono text-[0.82rem] font-medium text-ink">{{ node.label }}</span>
            <span class="font-mono text-[0.66rem] text-ink-2">{{ node.effectiveHardness }}</span>
            <span
              v-if="node.protected"
              class="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-wide text-paper"
              >protected</span
            >
          </div>
          <p class="mt-0.5 text-[0.9rem] leading-snug text-ink-2">{{ node.content }}</p>
        </div>
      </div>
      <AppTreeOutline
        v-if="node.children.length"
        :nodes="node.children"
        :depth="(depth ?? 0) + 1"
        :selected-id="selectedId"
        @select="(n) => emit('select', n)"
      />
    </li>
  </ul>
</template>
