<script setup lang="ts">
import type { ResolvedNode } from '~/types/tree'
import { hardnessColor } from '~/types/tree'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const treeId = computed(() => String(route.params.treeId))

const { data: forest, pending, error } = await useAsyncData(
  () => `tree-${treeId.value}`,
  () => $fetch<ResolvedNode[]>(`/api/trees/${encodeURIComponent(treeId.value)}`),
  { watch: [treeId] },
)

const view = ref<'rings' | 'outline'>('rings')
const selected = ref<ResolvedNode | null>(null)
const query = ref('')

const flat = computed<ResolvedNode[]>(() => {
  const out: ResolvedNode[] = []
  const walk = (nodes: ResolvedNode[]): void => {
    for (const n of nodes) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(forest.value ?? [])
  return out
})

const stats = computed(() => {
  const all = flat.value
  return {
    truths: all.length,
    roots: forest.value?.length ?? 0,
    protected: all.filter((n) => n.protected).length,
    hardest: all.reduce((m, n) => Math.max(m, n.effectiveHardness), 0),
  }
})

const matches = computed<ResolvedNode[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return flat.value
    .filter((n) => n.label.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    .slice(0, 8)
})

const choose = (node: ResolvedNode | null): void => {
  selected.value = node
}
const pickSearch = (node: ResolvedNode): void => {
  selected.value = node
  query.value = ''
  view.value = 'rings'
}
</script>

<template>
  <div class="flex h-[calc(100vh-3.25rem)] flex-col">
    <!-- sub header -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-3">
      <div class="flex items-baseline gap-4">
        <NuxtLink to="/app" class="font-mono text-[0.72rem] text-ink-2 hover:text-ink">← trees</NuxtLink>
        <h1 class="font-serif text-2xl font-medium tracking-tight">{{ treeId }}</h1>
        <div class="hidden gap-4 font-mono text-[0.66rem] text-ink-2 sm:flex">
          <span><b class="text-ink">{{ stats.truths }}</b> truths</span>
          <span><b class="text-ink">{{ stats.roots }}</b> roots</span>
          <span><b class="text-ink">{{ stats.protected }}</b> protected</span>
          <span>hardest <b class="text-rust">{{ stats.hardest }}</b></span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- search -->
        <div class="relative">
          <input
            v-model="query"
            type="text"
            placeholder="search truths"
            class="w-44 rounded-sm border border-line bg-paper-2 px-3 py-1.5 font-mono text-[0.78rem] outline-none focus:border-ink"
          />
          <ul
            v-if="matches.length"
            class="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-sm border border-line bg-paper shadow-lg"
          >
            <li
              v-for="m in matches"
              :key="m.id"
              class="cursor-pointer border-b border-line px-3 py-2 hover:bg-paper-2"
              @click="pickSearch(m)"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-mono text-[0.8rem] text-ink">{{ m.label }}</span>
                <span class="font-mono text-[0.62rem]" :style="{ color: hardnessColor(m.effectiveHardness) }"
                  >{{ m.effectiveHardness }}</span
                >
              </div>
              <p class="truncate text-[0.72rem] text-ink-2">{{ m.content }}</p>
            </li>
          </ul>
        </div>
        <!-- toggle -->
        <div class="flex overflow-hidden rounded-sm border border-line font-mono text-[0.72rem]">
          <button
            class="px-3 py-1.5"
            :class="view === 'rings' ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'"
            @click="view = 'rings'"
          >
            rings
          </button>
          <button
            class="px-3 py-1.5"
            :class="view === 'outline' ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'"
            @click="view = 'outline'"
          >
            outline
          </button>
        </div>
      </div>
    </div>

    <!-- body -->
    <div class="flex min-h-0 flex-1">
      <div class="relative min-h-0 flex-1">
        <div v-if="pending" class="grid h-full place-items-center font-mono text-sm text-ink-2">
          loading…
        </div>
        <div v-else-if="error" class="grid h-full place-items-center font-mono text-sm text-rust">
          could not load this tree.
        </div>
        <div
          v-else-if="!forest || forest.length === 0"
          class="grid h-full place-items-center px-6 text-center"
        >
          <div>
            <h2 class="font-serif text-2xl font-medium">This tree has no truths yet.</h2>
            <p class="mt-2 max-w-sm text-ink-2">
              Create the first root from your agent over MCP, then it grows here.
            </p>
          </div>
        </div>

        <AppTreeCanvas
          v-else-if="view === 'rings'"
          :forest="forest"
          :selected-id="selected?.id ?? null"
          @select="choose"
        />

        <div v-else class="h-full overflow-auto px-6 py-6">
          <AppTreeOutline :nodes="forest" />
        </div>
      </div>

      <!-- detail / legend panel -->
      <aside class="hidden w-[340px] shrink-0 overflow-auto border-l border-line bg-paper-2 px-5 py-6 lg:block">
        <template v-if="selected">
          <p class="kicker text-rust">selected truth</p>
          <h3 class="mt-2 font-mono text-lg font-medium text-ink">{{ selected.label }}</h3>
          <p class="mt-3 leading-relaxed text-ink">{{ selected.content }}</p>

          <div class="mt-6">
            <div class="flex items-baseline justify-between font-mono text-[0.7rem] text-ink-2">
              <span>hardness</span>
              <span class="text-ink">{{ selected.effectiveHardness }} / 100</span>
            </div>
            <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
              <div
                class="h-full rounded-full"
                :style="{
                  width: `${selected.effectiveHardness}%`,
                  background: hardnessColor(selected.effectiveHardness),
                }"
              ></div>
            </div>
          </div>

          <dl class="mt-6 space-y-2 font-mono text-[0.72rem]">
            <div class="flex justify-between border-b border-line py-1">
              <dt class="text-ink-2">protected</dt>
              <dd :class="selected.protected ? 'text-rust' : 'text-ink-2'">
                {{ selected.protected ? 'yes' : 'no' }}
              </dd>
            </div>
            <div class="flex justify-between border-b border-line py-1">
              <dt class="text-ink-2">depth from root</dt>
              <dd class="text-ink">{{ selected.depthFromRoot }}</dd>
            </div>
            <div class="flex justify-between border-b border-line py-1">
              <dt class="text-ink-2">carries below</dt>
              <dd class="text-ink">{{ selected.descendantWeight }}</dd>
            </div>
            <div class="flex justify-between border-b border-line py-1">
              <dt class="text-ink-2">direct children</dt>
              <dd class="text-ink">{{ selected.children.length }}</dd>
            </div>
          </dl>

          <button
            class="mt-6 font-mono text-[0.72rem] text-ink-2 hover:text-ink"
            @click="choose(null)"
          >
            clear selection
          </button>
        </template>

        <template v-else>
          <p class="kicker text-rust">reading the rings</p>
          <h3 class="mt-2 font-serif text-xl font-medium">The core bears everything.</h3>
          <p class="mt-3 text-[0.92rem] leading-relaxed text-ink-2">
            The dark center is the heartwood: the most authoritative truths. Depth radiates
            outward to the volatile leaves. Click a node to trace its path back to the core.
          </p>

          <div class="mt-6 space-y-2">
            <p class="kicker text-ink-2">hardness</p>
            <div class="flex items-center gap-2 font-mono text-[0.7rem] text-ink-2">
              <span class="h-3 w-3 rounded-full" :style="{ background: hardnessColor(95) }"></span>
              heartwood · roots · protected
            </div>
            <div class="flex items-center gap-2 font-mono text-[0.7rem] text-ink-2">
              <span class="h-3 w-3 rounded-full" :style="{ background: hardnessColor(55) }"></span>
              mid · load-bearing branches
            </div>
            <div class="flex items-center gap-2 font-mono text-[0.7rem] text-ink-2">
              <span class="h-3 w-3 rounded-full" :style="{ background: hardnessColor(28) }"></span>
              sapwood · volatile leaves
            </div>
            <div class="flex items-center gap-2 font-mono text-[0.7rem] text-ink-2">
              <span class="h-3 w-3 rounded-full ring-2 ring-amber"></span>
              amber ring = protected
            </div>
          </div>
        </template>
      </aside>
    </div>
  </div>
</template>
