<script setup lang="ts">
import type { ResolvedNode } from '~/types/tree'
import { hardnessColor } from '~/types/tree'
import { createTreeNode } from '~/composables/treeApi'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const treeId = computed(() => String(route.params.treeId))

const { data: forest, pending, error, refresh } = await useAsyncData(
  () => `tree-${treeId.value}`,
  () => $fetch<ResolvedNode[]>(`/api/trees/${encodeURIComponent(treeId.value)}`),
  { watch: [treeId] },
)

const view = ref<'rings' | 'outline'>('rings')
const selected = ref<ResolvedNode | null>(null)
const query = ref('')

// new-root form
const addingRoot = ref(false)
const rootLabel = ref('')
const rootContent = ref('')
const rootHardness = ref('')
const rootBusy = ref(false)
const rootError = ref('')

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

// After any mutation: refetch the forest, then keep the selection pointed at the
// fresh copy of the same node (or clear it if the node is gone).
const onChanged = async (): Promise<void> => {
  await refresh()
  if (selected.value) {
    const id = selected.value.id
    selected.value = flat.value.find((n) => n.id === id) ?? null
  }
}

const createRoot = async (): Promise<void> => {
  if (rootBusy.value) return
  rootBusy.value = true
  rootError.value = ''
  try {
    const h = rootHardness.value.trim()
    const res = await createTreeNode(treeId.value, {
      parentId: null,
      label: rootLabel.value.trim(),
      content: rootContent.value.trim(),
      hardnessSet: h === '' ? null : Math.max(0, Math.min(100, Number(h))),
    })
    addingRoot.value = false
    rootLabel.value = ''
    rootContent.value = ''
    rootHardness.value = ''
    selected.value = res.node
    await onChanged()
  } catch (e) {
    rootError.value = e instanceof Error ? e.message : 'Could not create the root.'
  } finally {
    rootBusy.value = false
  }
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
        <button
          class="rounded-sm bg-ink px-3 py-1.5 font-mono text-[0.72rem] text-paper transition-transform hover:-translate-y-0.5"
          @click="addingRoot = true"
        >
          + root
        </button>
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
              Plant the first root here, or grow it from your agent over MCP.
            </p>
            <button
              class="mt-5 rounded-sm bg-ink px-5 py-2 font-mono text-[0.8rem] text-paper transition-transform hover:-translate-y-0.5"
              @click="addingRoot = true"
            >
              + plant a root
            </button>
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
        <AppNodeEditor
          v-if="selected"
          :tree-id="treeId"
          :node="selected"
          :all-nodes="flat"
          @select="choose"
          @changed="onChanged"
        />

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

    <!-- new root modal -->
    <div
      v-if="addingRoot"
      class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4"
      @click.self="addingRoot = false"
    >
      <form
        class="w-full max-w-md rounded-sm border-2 border-ink bg-paper p-6 shadow-2xl"
        @submit.prevent="createRoot"
      >
        <p class="kicker text-rust">a new root</p>
        <h2 class="mt-2 font-serif text-2xl font-medium tracking-tight">Plant a root truth</h2>
        <p class="mt-1 text-[0.88rem] text-ink-2">
          Roots are the hardest, most authoritative truths. Add only what rarely changes.
        </p>
        <input
          v-model="rootLabel"
          required
          placeholder="label, e.g. identity"
          class="mt-4 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        />
        <textarea
          v-model="rootContent"
          required
          rows="4"
          placeholder="the single truth this root holds"
          class="mt-3 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-ink"
        ></textarea>
        <input
          v-model="rootHardness"
          inputmode="numeric"
          placeholder="propose hardness 0-100 (optional)"
          class="mt-3 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        />
        <p v-if="rootError" class="mt-3 font-mono text-[0.74rem] text-rust">{{ rootError }}</p>
        <div class="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            class="font-mono text-[0.82rem] text-ink-2 hover:text-ink"
            @click="addingRoot = false"
          >
            cancel
          </button>
          <button
            type="submit"
            :disabled="rootBusy || !rootLabel.trim() || !rootContent.trim()"
            class="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-semibold text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {{ rootBusy ? 'Planting…' : 'Plant root' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
