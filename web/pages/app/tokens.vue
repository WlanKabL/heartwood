<script setup lang="ts">
import type { ApiToken } from '~/types/tree'

definePageMeta({ layout: 'app', middleware: 'auth' })

const tokens = ref<ApiToken[]>([])
const loading = ref(true)
const newName = ref('')
const creating = ref(false)
const revealed = ref<{ name: string; raw: string } | null>(null)
const copied = ref(false)
const errorMsg = ref('')

const load = async (): Promise<void> => {
  loading.value = true
  try {
    tokens.value = await $fetch<ApiToken[]>('/api/tokens')
  } catch {
    errorMsg.value = 'Could not load tokens.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const create = async (): Promise<void> => {
  const name = newName.value.trim()
  if (!name || creating.value) return
  creating.value = true
  errorMsg.value = ''
  try {
    const created = await $fetch<ApiToken & { raw: string }>('/api/tokens', {
      method: 'POST',
      body: { name },
    })
    revealed.value = { name: created.name, raw: created.raw }
    copied.value = false
    tokens.value.push({ id: created.id, name: created.name, prefix: created.prefix })
    newName.value = ''
  } catch {
    errorMsg.value = 'Could not create the token.'
  } finally {
    creating.value = false
  }
}

const remove = async (token: ApiToken): Promise<void> => {
  if (!confirm(`Delete token "${token.name}"? Any agent using it loses access.`)) return
  try {
    await $fetch(`/api/tokens/${encodeURIComponent(token.id)}`, { method: 'DELETE' })
    tokens.value = tokens.value.filter((t) => t.id !== token.id)
  } catch {
    errorMsg.value = 'Could not delete the token.'
  }
}

const copy = async (): Promise<void> => {
  if (!revealed.value) return
  try {
    await navigator.clipboard.writeText(revealed.value.raw)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-12">
    <p class="kicker text-rust">agent credentials</p>
    <h1 class="mt-2 font-serif text-4xl font-medium tracking-tight">API tokens</h1>
    <p class="mt-3 max-w-xl text-ink-2">
      One token is all your agent needs over MCP. Paste it into your
      <code class="font-mono text-[0.85em]">.mcp.json</code>. The raw value is shown once, on
      creation, and only a hash is stored.
    </p>

    <!-- create -->
    <form class="mt-8 flex flex-wrap items-center gap-3" @submit.prevent="create">
      <input
        v-model="newName"
        type="text"
        placeholder="Token name, e.g. laptop"
        autocomplete="off"
        class="w-64 rounded-sm border border-line bg-paper-2 px-3 py-2 font-mono text-sm outline-none focus:border-ink"
      />
      <button
        type="submit"
        :disabled="creating || !newName.trim()"
        class="rounded-sm bg-ink px-5 py-2 text-[0.9rem] font-semibold text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-40"
      >
        {{ creating ? 'Creating…' : 'Create token' }}
      </button>
    </form>

    <!-- reveal-once -->
    <div
      v-if="revealed"
      class="mt-5 rounded-sm border-2 border-amber bg-paper-2 p-5"
    >
      <p class="font-mono text-[0.72rem] uppercase tracking-wide text-rust">
        Copy this now. It will not be shown again.
      </p>
      <div class="mt-2 break-all rounded-sm border border-line bg-paper p-3 font-mono text-sm">
        {{ revealed.raw }}
      </div>
      <button
        class="mt-3 rounded-sm border border-ink px-4 py-1.5 font-mono text-[0.8rem] hover:bg-ink hover:text-paper"
        @click="copy"
      >
        {{ copied ? 'Copied ✓' : 'Copy' }}
      </button>
    </div>

    <p v-if="errorMsg" class="mt-4 font-mono text-sm text-rust">{{ errorMsg }}</p>

    <!-- list -->
    <div class="mt-12">
      <p class="kicker text-ink-2">your tokens</p>
      <div v-if="loading" class="mt-4 font-mono text-sm text-ink-2">loading…</div>
      <p v-else-if="tokens.length === 0" class="mt-4 font-mono text-sm text-ink-2">No tokens yet.</p>
      <ul v-else class="mt-4 border-t-[1.5px] border-ink">
        <li
          v-for="token in tokens"
          :key="token.id"
          class="flex items-center justify-between gap-4 border-b border-line py-4"
        >
          <div class="flex items-baseline gap-4">
            <span class="font-mono text-[0.95rem] font-medium text-ink">{{ token.name }}</span>
            <code class="font-mono text-[0.78rem] text-ink-2">{{ token.prefix }}…</code>
          </div>
          <button
            class="font-mono text-[0.78rem] text-rust transition-colors hover:text-ink"
            @click="remove(token)"
          >
            delete
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
