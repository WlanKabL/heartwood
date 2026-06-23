<script setup lang="ts">
import type { ResolvedNode, TreeSummary } from '~/types/tree'

definePageMeta({ layout: 'app', middleware: 'auth' })

interface TreeCard {
  treeId: string
  forest: ResolvedNode[]
  truths: number
  roots: number
  protectedCount: number
  hardest: number
}

const statsOf = (treeId: string, forest: ResolvedNode[]): TreeCard => {
  const all: ResolvedNode[] = []
  const walk = (nodes: ResolvedNode[]): void => {
    for (const n of nodes) {
      all.push(n)
      walk(n.children)
    }
  }
  walk(forest)
  return {
    treeId,
    forest,
    truths: all.length,
    roots: forest.length,
    protectedCount: all.filter((n) => n.protected).length,
    hardest: all.reduce((m, n) => Math.max(m, n.effectiveHardness), 0),
  }
}

const { data: cards, pending, error } = await useAsyncData('overview', async () => {
  const summaries = await $fetch<TreeSummary[]>('/api/trees')
  const detailed = await Promise.all(
    summaries.map(async (s) => {
      const forest = await $fetch<ResolvedNode[]>(`/api/trees/${encodeURIComponent(s.treeId)}`)
      return statsOf(s.treeId, forest)
    }),
  )
  return detailed.sort((a, b) => b.truths - a.truths)
})

const hero = computed(() => cards.value?.[0] ?? null)
const rest = computed(() => cards.value?.slice(1) ?? [])
</script>

<template>
  <section class="mx-auto max-w-5xl px-6 py-12">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="kicker text-rust">your forest</p>
        <h1 class="mt-2 font-serif text-4xl font-medium tracking-tight">Trees</h1>
        <p class="mt-3 max-w-xl text-ink-2">
          Each tree is one project's hardened truth. Open a tree to read its rings, or grow new
          truths from your agent over MCP.
        </p>
      </div>
      <NuxtLink
        to="/app/tokens"
        class="rounded-sm border border-ink px-4 py-2 font-mono text-[0.8rem] hover:bg-ink hover:text-paper"
        >connect an agent →</NuxtLink
      >
    </div>

    <div v-if="pending" class="mt-12 font-mono text-sm text-ink-2">loading your forest…</div>
    <div v-else-if="error" class="mt-12 font-mono text-sm text-rust">
      could not load trees. is the backend running?
    </div>

    <div
      v-else-if="!cards || cards.length === 0"
      class="mt-12 rounded-sm border border-line bg-paper-2 p-10 text-center"
    >
      <div class="mx-auto w-fit opacity-70">
        <AppTreeGlyph :forest="[]" :size="96" />
      </div>
      <h2 class="mt-4 font-serif text-2xl font-medium">Your forest is bare.</h2>
      <p class="mx-auto mt-2 max-w-md text-ink-2">
        Connect Heartwood to your agent and create your first root truth. The
        <NuxtLink to="/docs" class="text-rust underline-offset-2 hover:underline">setup guide</NuxtLink>
        takes two minutes.
      </p>
    </div>

    <div v-else class="mt-12 space-y-6">
      <!-- hero tree -->
      <NuxtLink
        v-if="hero"
        :to="`/app/trees/${encodeURIComponent(hero.treeId)}`"
        class="group flex flex-col items-center gap-8 rounded-sm border-[1.5px] border-ink bg-paper-2 p-8 transition-colors hover:bg-[#e3d6bd] sm:flex-row"
      >
        <AppTreeGlyph :forest="hero.forest" :size="160" />
        <div class="flex-1">
          <p class="kicker text-rust">most grown</p>
          <h2 class="mt-1 font-serif text-4xl font-medium tracking-tight">{{ hero.treeId }}</h2>
          <div class="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[0.74rem] text-ink-2">
            <span><b class="text-ink">{{ hero.truths }}</b> truths</span>
            <span><b class="text-ink">{{ hero.roots }}</b> roots</span>
            <span><b class="text-ink">{{ hero.protectedCount }}</b> protected</span>
            <span>hardest core <b class="text-rust">{{ hero.hardest }}</b></span>
          </div>
        </div>
        <span class="self-end font-mono text-[0.8rem] text-ink-2 transition-transform group-hover:translate-x-1"
          >open →</span
        >
      </NuxtLink>

      <!-- the rest -->
      <div v-if="rest.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="card in rest"
          :key="card.treeId"
          :to="`/app/trees/${encodeURIComponent(card.treeId)}`"
          class="group flex flex-col rounded-sm border border-line bg-paper-2 p-6 transition-colors hover:border-ink"
        >
          <AppTreeGlyph :forest="card.forest" :size="110" />
          <h3 class="mt-4 font-serif text-2xl font-medium tracking-tight">{{ card.treeId }}</h3>
          <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.68rem] text-ink-2">
            <span><b class="text-ink">{{ card.truths }}</b> truths</span>
            <span><b class="text-ink">{{ card.roots }}</b> roots</span>
            <span><b class="text-ink">{{ card.protectedCount }}</b> protected</span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>
