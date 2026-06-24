<script setup lang="ts">
import {
  listWorkflows,
  defineWorkflow,
  deleteWorkflow,
  runWorkflow,
  type Workflow,
} from '~/composables/treeApi'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const treeId = computed(() => String(route.params.treeId))

// Literal placeholder tokens, kept as constants so the template does not try to interpolate them.
const truthsToken = '{{truths}}'
const inputToken = '{{input}}'

const { data: workflows, pending, error, refresh } = await useAsyncData(
  () => `workflows-${treeId.value}`,
  () => listWorkflows(treeId.value),
  { watch: [treeId] },
)

// run state, keyed by workflow name
const runInput = reactive<Record<string, string>>({})
const runOutput = reactive<Record<string, string>>({})
const runBusy = ref('')
const runError = ref('')
const copied = ref('')

const run = async (name: string): Promise<void> => {
  runBusy.value = name
  runError.value = ''
  try {
    const res = await runWorkflow(treeId.value, name, runInput[name] ?? '')
    runOutput[name] = res.text
  } catch (e) {
    runError.value = e instanceof Error ? e.message : 'Could not run the workflow.'
  } finally {
    runBusy.value = ''
  }
}

const copy = async (name: string): Promise<void> => {
  const text = runOutput[name]
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = name
    setTimeout(() => (copied.value = ''), 1500)
  } catch {
    copied.value = ''
  }
}

const remove = async (w: Workflow): Promise<void> => {
  if (!confirm(`Delete workflow "${w.name}"? This cannot be undone.`)) return
  try {
    await deleteWorkflow(treeId.value, w.name)
    await refresh()
  } catch (e) {
    runError.value = e instanceof Error ? e.message : 'Could not delete the workflow.'
  }
}

// create form
const creating = ref(false)
const formName = ref('')
const formDesc = ref('')
const formTemplate = ref('')
const formBusy = ref(false)
const formError = ref('')

const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
const formSlug = computed(() => slug(formName.value))

const create = async (): Promise<void> => {
  if (formBusy.value || !formSlug.value || !formTemplate.value.trim()) return
  formBusy.value = true
  formError.value = ''
  try {
    await defineWorkflow(treeId.value, {
      name: formSlug.value,
      description: formDesc.value.trim(),
      template: formTemplate.value,
    })
    creating.value = false
    formName.value = ''
    formDesc.value = ''
    formTemplate.value = ''
    await refresh()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Could not create the workflow.'
  } finally {
    formBusy.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-12">
    <NuxtLink
      :to="`/app/trees/${encodeURIComponent(treeId)}`"
      class="font-mono text-[0.72rem] text-ink-2 hover:text-ink"
      >← {{ treeId }}</NuxtLink
    >
    <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="kicker text-rust">application layer</p>
        <h1 class="mt-2 font-serif text-4xl font-medium tracking-tight">Workflows</h1>
        <p class="mt-3 max-w-xl text-ink-2">
          Reusable prompts for this tree. A template mixes the tree's protected truths
          (<code class="font-mono text-[0.85em]">{{ truthsToken }}</code>) with an input
          (<code class="font-mono text-[0.85em]">{{ inputToken }}</code>). Running one fills both and
          hands you ready-to-paste text.
        </p>
      </div>
      <button
        class="rounded-sm bg-ink px-4 py-2 font-mono text-[0.8rem] text-paper transition-transform hover:-translate-y-0.5"
        @click="creating = true"
      >
        + new workflow
      </button>
    </div>

    <div v-if="pending" class="mt-12 font-mono text-sm text-ink-2">loading…</div>
    <div v-else-if="error" class="mt-12 font-mono text-sm text-rust">could not load workflows.</div>
    <div
      v-else-if="!workflows || workflows.length === 0"
      class="mt-12 rounded-sm border border-line bg-paper-2 p-8 text-center"
    >
      <p class="font-serif text-2xl font-medium">No workflows yet.</p>
      <p class="mx-auto mt-2 max-w-sm text-ink-2">
        Create one here, or define it from your agent over MCP with
        <code class="font-mono text-[0.85em]">define_workflow</code>.
      </p>
    </div>

    <div v-else class="mt-10 space-y-5">
      <div v-for="w in workflows" :key="w.name" class="rounded-sm border border-line bg-paper-2 p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="font-mono text-[1rem] font-medium text-ink">{{ w.name }}</h2>
            <p v-if="w.description" class="mt-1 text-[0.9rem] text-ink-2">{{ w.description }}</p>
          </div>
          <button class="shrink-0 font-mono text-[0.72rem] text-rust hover:text-ink" @click="remove(w)">
            delete
          </button>
        </div>

        <details class="mt-3">
          <summary class="cursor-pointer font-mono text-[0.72rem] text-ink-2 hover:text-ink">
            template
          </summary>
          <pre
            class="mt-2 overflow-x-auto rounded-sm border border-line bg-paper p-3 font-mono text-[0.74rem] leading-relaxed text-ink"
          >{{ w.template }}</pre>
        </details>

        <div class="mt-4">
          <textarea
            v-model="runInput[w.name]"
            rows="2"
            placeholder="input (optional)"
            class="w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          ></textarea>
          <div class="mt-2 flex items-center gap-3">
            <button
              :disabled="runBusy === w.name"
              class="rounded-sm bg-ink px-4 py-1.5 font-mono text-[0.76rem] text-paper disabled:opacity-50"
              @click="run(w.name)"
            >
              {{ runBusy === w.name ? 'running…' : 'run' }}
            </button>
            <button
              v-if="runOutput[w.name]"
              class="font-mono text-[0.72rem] text-rust hover:text-ink"
              @click="copy(w.name)"
            >
              {{ copied === w.name ? 'copied ✓' : 'copy output' }}
            </button>
          </div>
          <pre
            v-if="runOutput[w.name]"
            class="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-sm border border-amber bg-paper p-3 font-mono text-[0.74rem] leading-relaxed text-ink"
          >{{ runOutput[w.name] }}</pre>
        </div>
      </div>
    </div>
    <p v-if="runError" class="mt-4 font-mono text-sm text-rust">{{ runError }}</p>

    <!-- create modal -->
    <div
      v-if="creating"
      class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4"
      @click.self="creating = false"
    >
      <form
        class="w-full max-w-lg rounded-sm border-2 border-ink bg-paper p-6 shadow-2xl"
        @submit.prevent="create"
      >
        <p class="kicker text-rust">a new workflow</p>
        <h2 class="mt-2 font-serif text-2xl font-medium tracking-tight">Define a workflow</h2>
        <input
          v-model="formName"
          required
          placeholder="name, e.g. plan post"
          class="mt-4 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        />
        <p v-if="formSlug" class="mt-1 font-mono text-[0.7rem] text-ink-2">
          name: <span class="text-ink">{{ formSlug }}</span>
        </p>
        <input
          v-model="formDesc"
          placeholder="short description (optional)"
          class="mt-3 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <textarea
          v-model="formTemplate"
          required
          rows="6"
          :placeholder="`the template, use ${truthsToken} and ${inputToken}`"
          class="mt-3 w-full rounded-sm border border-line bg-paper-2 px-3 py-2 font-mono text-sm outline-none focus:border-ink"
        ></textarea>
        <p v-if="formError" class="mt-3 font-mono text-[0.74rem] text-rust">{{ formError }}</p>
        <div class="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            class="font-mono text-[0.82rem] text-ink-2 hover:text-ink"
            @click="creating = false"
          >
            cancel
          </button>
          <button
            type="submit"
            :disabled="formBusy || !formSlug || !formTemplate.trim()"
            class="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-semibold text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {{ formBusy ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
