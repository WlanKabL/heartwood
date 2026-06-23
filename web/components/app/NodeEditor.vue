<script setup lang="ts">
import type { CascadePreview, ResolvedNode } from '~/types/tree'
import { hardnessColor, isCascadePreview } from '~/types/tree'
import {
  createTreeNode,
  updateTreeNode,
  moveTreeNode,
  deleteTreeNode,
} from '~/composables/treeApi'

const props = defineProps<{ treeId: string; node: ResolvedNode; allNodes: ResolvedNode[] }>()
const emit = defineEmits<{ (e: 'changed'): void; (e: 'select', node: ResolvedNode | null): void }>()

type Mode = 'view' | 'edit' | 'add' | 'move'
const mode = ref<Mode>('view')
const busy = ref(false)
const error = ref('')
const notices = ref<string[]>([])

const editLabel = ref('')
const editContent = ref('')
const editHardness = ref('')

const addLabel = ref('')
const addContent = ref('')
const addHardness = ref('')

const moveTarget = ref<string | null>(null)

const pendingPreview = ref<CascadePreview | null>(null)
let pendingAction: (() => Promise<void>) | null = null

watch(
  () => props.node.id,
  () => {
    mode.value = 'view'
    error.value = ''
  },
)

const descendantIds = computed(() => {
  const set = new Set<string>()
  const walk = (nodes: ResolvedNode[]): void => {
    for (const n of nodes) {
      set.add(n.id)
      walk(n.children)
    }
  }
  walk(props.node.children)
  return set
})
const moveOptions = computed(() =>
  props.allNodes.filter((n) => n.id !== props.node.id && !descendantIds.value.has(n.id)),
)

const parseHardness = (raw: string): number | undefined => {
  const t = raw.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined
}

const run = async (fn: () => Promise<void>): Promise<void> => {
  busy.value = true
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    busy.value = false
  }
}

// ---- edit -----------------------------------------------------------------
const startEdit = (): void => {
  editLabel.value = props.node.label
  editContent.value = props.node.content
  editHardness.value = ''
  mode.value = 'edit'
}
const saveEdit = (): Promise<void> =>
  run(async () => {
    const apply = async (confirm: boolean): Promise<void> => {
      const res = await updateTreeNode(props.treeId, props.node.id, {
        label: editLabel.value.trim(),
        content: editContent.value.trim(),
        hardnessSet: parseHardness(editHardness.value),
        confirm,
      })
      if (isCascadePreview(res)) {
        pendingPreview.value = res
        pendingAction = () => apply(true)
        return
      }
      notices.value = res.hardnessNote ? [res.hardnessNote] : []
      finish(res.node)
    }
    await apply(false)
  })

// ---- add child ------------------------------------------------------------
const startAdd = (): void => {
  addLabel.value = ''
  addContent.value = ''
  addHardness.value = ''
  mode.value = 'add'
}
const saveAdd = (): Promise<void> =>
  run(async () => {
    const res = await createTreeNode(props.treeId, {
      parentId: props.node.id,
      label: addLabel.value.trim(),
      content: addContent.value.trim(),
      hardnessSet: parseHardness(addHardness.value) ?? null,
    })
    notices.value = [res.hardnessNote, res.volatilityWarning, res.similarTo ? `Similar to “${res.similarTo.label}”` : undefined].filter(
      (n): n is string => Boolean(n),
    )
    finish(res.node)
  })

// ---- move -----------------------------------------------------------------
const startMove = (): void => {
  moveTarget.value = props.node.parentId
  mode.value = 'move'
}
const saveMove = (): Promise<void> =>
  run(async () => {
    const apply = async (confirm: boolean): Promise<void> => {
      const res = await moveTreeNode(props.treeId, props.node.id, moveTarget.value, confirm)
      if (isCascadePreview(res)) {
        pendingPreview.value = res
        pendingAction = () => apply(true)
        return
      }
      finish(res)
    }
    await apply(false)
  })

// ---- delete ---------------------------------------------------------------
const del = (): Promise<void> =>
  run(async () => {
    const apply = async (confirm: boolean): Promise<void> => {
      const res = await deleteTreeNode(props.treeId, props.node.id, confirm)
      if (isCascadePreview(res)) {
        pendingPreview.value = res
        pendingAction = () => apply(true)
        return
      }
      pendingPreview.value = null
      mode.value = 'view'
      emit('select', null)
      emit('changed')
    }
    await apply(false)
  })

const confirmPreview = (): Promise<void> =>
  run(async () => {
    const action = pendingAction
    pendingAction = null
    pendingPreview.value = null
    if (action) await action()
  })
const cancelPreview = (): void => {
  pendingPreview.value = null
  pendingAction = null
}

const finish = (node: ResolvedNode): void => {
  mode.value = 'view'
  emit('select', node)
  emit('changed')
}
</script>

<template>
  <div>
    <!-- advisory notices -->
    <div
      v-if="notices.length"
      class="mb-4 space-y-1 rounded-sm border border-amber bg-paper px-3 py-2 font-mono text-[0.72rem] text-ink-2"
    >
      <p v-for="(n, i) in notices" :key="i">· {{ n }}</p>
    </div>
    <p v-if="error" class="mb-3 font-mono text-[0.74rem] text-rust">{{ error }}</p>

    <!-- VIEW -->
    <template v-if="mode === 'view'">
      <div class="flex items-start justify-between gap-2">
        <p class="kicker text-rust">selected truth</p>
        <button class="font-mono text-[0.68rem] text-ink-2 hover:text-ink" @click="emit('select', null)">
          clear
        </button>
      </div>
      <h3 class="mt-2 font-mono text-lg font-medium text-ink">{{ node.label }}</h3>
      <p class="mt-3 leading-relaxed text-ink">{{ node.content }}</p>

      <div class="mt-6">
        <div class="flex items-baseline justify-between font-mono text-[0.7rem] text-ink-2">
          <span>hardness</span><span class="text-ink">{{ node.effectiveHardness }} / 100</span>
        </div>
        <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
          <div
            class="h-full rounded-full"
            :style="{ width: `${node.effectiveHardness}%`, background: hardnessColor(node.effectiveHardness) }"
          ></div>
        </div>
      </div>

      <dl class="mt-6 space-y-2 font-mono text-[0.72rem]">
        <div class="flex justify-between border-b border-line py-1">
          <dt class="text-ink-2">protected</dt>
          <dd :class="node.protected ? 'text-rust' : 'text-ink-2'">{{ node.protected ? 'yes' : 'no' }}</dd>
        </div>
        <div class="flex justify-between border-b border-line py-1">
          <dt class="text-ink-2">depth from root</dt>
          <dd class="text-ink">{{ node.depthFromRoot }}</dd>
        </div>
        <div class="flex justify-between border-b border-line py-1">
          <dt class="text-ink-2">carries below</dt>
          <dd class="text-ink">{{ node.descendantWeight }}</dd>
        </div>
      </dl>

      <div class="mt-6 grid grid-cols-2 gap-2 font-mono text-[0.78rem]">
        <button class="rounded-sm border border-ink py-2 hover:bg-ink hover:text-paper" @click="startEdit">
          edit
        </button>
        <button class="rounded-sm border border-ink py-2 hover:bg-ink hover:text-paper" @click="startAdd">
          add child
        </button>
        <button class="rounded-sm border border-line py-2 hover:border-ink" @click="startMove">
          move
        </button>
        <button class="rounded-sm border border-line py-2 text-rust hover:border-rust" @click="del">
          delete
        </button>
      </div>
    </template>

    <!-- EDIT -->
    <form v-else-if="mode === 'edit'" class="space-y-3" @submit.prevent="saveEdit">
      <p class="kicker text-rust">edit truth</p>
      <input v-model="editLabel" class="w-full rounded-sm border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink" placeholder="label" />
      <textarea v-model="editContent" rows="5" class="w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink" placeholder="the truth"></textarea>
      <input v-model="editHardness" inputmode="numeric" class="w-full rounded-sm border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink" placeholder="propose hardness 0-100 (optional)" />
      <div class="flex gap-2">
        <button type="submit" :disabled="busy" class="flex-1 rounded-sm bg-ink py-2 font-mono text-[0.8rem] text-paper disabled:opacity-50">save</button>
        <button type="button" class="rounded-sm border border-line px-4 font-mono text-[0.8rem]" @click="mode = 'view'">cancel</button>
      </div>
    </form>

    <!-- ADD -->
    <form v-else-if="mode === 'add'" class="space-y-3" @submit.prevent="saveAdd">
      <p class="kicker text-rust">add child of {{ node.label }}</p>
      <input v-model="addLabel" required class="w-full rounded-sm border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink" placeholder="label, e.g. voice" />
      <textarea v-model="addContent" required rows="5" class="w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink" placeholder="the single truth"></textarea>
      <input v-model="addHardness" inputmode="numeric" class="w-full rounded-sm border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink" placeholder="propose hardness 0-100 (optional)" />
      <div class="flex gap-2">
        <button type="submit" :disabled="busy || !addLabel.trim() || !addContent.trim()" class="flex-1 rounded-sm bg-ink py-2 font-mono text-[0.8rem] text-paper disabled:opacity-50">create</button>
        <button type="button" class="rounded-sm border border-line px-4 font-mono text-[0.8rem]" @click="mode = 'view'">cancel</button>
      </div>
    </form>

    <!-- MOVE -->
    <form v-else class="space-y-3" @submit.prevent="saveMove">
      <p class="kicker text-rust">move {{ node.label }} under</p>
      <select v-model="moveTarget" class="w-full rounded-sm border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-ink">
        <option :value="null">— make it a root —</option>
        <option v-for="opt in moveOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
      </select>
      <div class="flex gap-2">
        <button type="submit" :disabled="busy" class="flex-1 rounded-sm bg-ink py-2 font-mono text-[0.8rem] text-paper disabled:opacity-50">move</button>
        <button type="button" class="rounded-sm border border-line px-4 font-mono text-[0.8rem]" @click="mode = 'view'">cancel</button>
      </div>
    </form>

    <AppCascadeModal
      v-if="pendingPreview"
      :preview="pendingPreview"
      :busy="busy"
      @confirm="confirmPreview"
      @cancel="cancelPreview"
    />
  </div>
</template>
