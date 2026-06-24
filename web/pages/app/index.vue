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

// Start a tree by hand: a tree exists once it has its first node, so we just pick a treeId and
// open it; the tree page's empty state takes it from there ("plant a root").
const addingTree = ref(false)
const newTreeId = ref('')
const slugify = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
const newTreeSlug = computed(() => slugify(newTreeId.value))

const openNewTree = async (): Promise<void> => {
  const id = newTreeSlug.value
  if (!id) return
  addingTree.value = false
  newTreeId.value = ''
  await navigateTo(`/app/trees/${encodeURIComponent(id)}`)
}
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
      <div class="flex flex-wrap items-center gap-3">
        <button
          class="rounded-sm bg-ink px-4 py-2 font-mono text-[0.8rem] text-paper transition-transform hover:-translate-y-0.5"
          @click="addingTree = true"
        >
          + new tree
        </button>
        <NuxtLink
          to="/app/tokens"
          class="rounded-sm border border-ink px-4 py-2 font-mono text-[0.8rem] hover:bg-ink hover:text-paper"
          >connect an agent →</NuxtLink
        >
      </div>
    </div>

    <div v-if="pending" class="mt-12 font-mono text-sm text-ink-2">loading your forest…</div>
    <div v-else-if="error" class="mt-12 font-mono text-sm text-rust">
      could not load trees. is the backend running?
    </div>

    <div
      v-else-if="!cards || cards.length === 0"
      class="mt-12 flex flex-col gap-8 rounded-sm border-[1.5px] border-ink bg-paper-2 p-8 sm:flex-row sm:items-start"
    >
      <AppTreeGlyph :forest="[]" :size="140" class="opacity-60" />
      <div class="flex-1">
        <p class="kicker text-rust">first run</p>
        <h2 class="mt-1 font-serif text-3xl font-medium tracking-tight">Your forest is bare.</h2>
        <p class="mt-2 max-w-xl text-ink-2">
          Two ways to start: let your agent interview you and grow the first tree over MCP, or
          plant one by hand right now.
        </p>
        <button
          class="mt-4 rounded-sm bg-ink px-5 py-2 font-mono text-[0.8rem] text-paper transition-transform hover:-translate-y-0.5"
          @click="addingTree = true"
        >
          + start a tree by hand
        </button>

        <p class="mt-8 kicker text-ink-2">or, with an agent</p>
        <ol class="mt-3 space-y-6">
          <li>
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[0.8rem] text-rust">01</span>
              <h3 class="font-mono text-[0.92rem] font-medium text-ink">Connect your agent</h3>
            </div>
            <p class="ml-7 mt-1 text-[0.9rem] text-ink-2">
              Mint a token and register Heartwood in a single line.
            </p>
            <NuxtLink
              to="/app/tokens"
              class="ml-7 mt-2 inline-block rounded-sm bg-ink px-4 py-2 font-mono text-[0.78rem] text-paper transition-transform hover:-translate-y-0.5"
              >get a token &amp; connect →</NuxtLink
            >
          </li>
          <li>
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[0.8rem] text-rust">02</span>
              <h3 class="font-mono text-[0.92rem] font-medium text-ink">Let it build the tree</h3>
            </div>
            <p class="ml-7 mt-1 text-[0.9rem] text-ink-2">
              Paste this into a Claude Code session that has Heartwood connected. The agent
              interviews you and grows the tree itself.
            </p>
            <div class="ml-7 mt-2 max-w-xl">
              <AppCopyBlock :code="bootstrapPrompt()" label="bootstrap prompt" />
            </div>
          </li>
        </ol>
      </div>
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
    <!-- new tree modal -->
    <div
      v-if="addingTree"
      class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4"
      @click.self="addingTree = false"
    >
      <form
        class="w-full max-w-md rounded-sm border-2 border-ink bg-paper p-6 shadow-2xl"
        @submit.prevent="openNewTree"
      >
        <p class="kicker text-rust">a new tree</p>
        <h2 class="mt-2 font-serif text-2xl font-medium tracking-tight">Name the tree</h2>
        <p class="mt-1 text-[0.88rem] text-ink-2">
          Use the project's real short name, like <code class="font-mono text-[0.85em]">keeperlog</code>.
          It is permanent and shared with your agent, so avoid placeholders.
        </p>
        <input
          v-model="newTreeId"
          required
          placeholder="project name, e.g. keeperlog"
          class="mt-4 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        />
        <p v-if="newTreeSlug" class="mt-2 font-mono text-[0.72rem] text-ink-2">
          tree id: <span class="text-ink">{{ newTreeSlug }}</span>
        </p>
        <div class="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            class="font-mono text-[0.82rem] text-ink-2 hover:text-ink"
            @click="addingTree = false"
          >
            cancel
          </button>
          <button
            type="submit"
            :disabled="!newTreeSlug"
            class="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-semibold text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            open the tree →
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
