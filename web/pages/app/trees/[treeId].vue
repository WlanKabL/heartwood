<script setup lang="ts">
import type { ResolvedNode } from '~/types/tree'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const treeId = computed(() => String(route.params.treeId))

const { data: forest, pending, error } = await useAsyncData(
  () => `tree-${treeId.value}`,
  () => $fetch<ResolvedNode[]>(`/api/trees/${encodeURIComponent(treeId.value)}`),
  { watch: [treeId] },
)

const count = computed(() => {
  const walk = (nodes: ResolvedNode[]): number =>
    nodes.reduce((n, node) => n + 1 + walk(node.children), 0)
  return forest.value ? walk(forest.value) : 0
})
</script>

<template>
  <section class="mx-auto max-w-4xl px-6 py-12">
    <NuxtLink to="/app" class="font-mono text-[0.72rem] text-ink-2 hover:text-ink">← trees</NuxtLink>

    <div class="mt-3 flex flex-wrap items-baseline justify-between gap-3">
      <h1 class="font-serif text-4xl font-medium tracking-tight">{{ treeId }}</h1>
      <span class="font-mono text-[0.72rem] text-ink-2">{{ count }} truths</span>
    </div>
    <p class="mt-2 max-w-xl text-ink-2">
      Read-only outline. The radial ring view and editing land next. Hardness is the dot color
      and the number; the deeper a truth, the harder it resists a prompt.
    </p>

    <div v-if="pending" class="mt-10 font-mono text-sm text-ink-2">loading…</div>
    <div v-else-if="error" class="mt-10 font-mono text-sm text-rust">could not load this tree.</div>
    <div v-else-if="!forest || forest.length === 0" class="mt-10 font-mono text-sm text-ink-2">
      this tree has no truths yet.
    </div>
    <div v-else class="mt-8">
      <AppTreeOutline :nodes="forest" />
    </div>
  </section>
</template>
