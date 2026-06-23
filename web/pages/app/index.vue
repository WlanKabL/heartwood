<script setup lang="ts">
import type { TreeSummary } from '~/types/tree'

definePageMeta({ layout: 'app', middleware: 'auth' })

const { data: trees, pending, error } = await useAsyncData('trees', () =>
  $fetch<TreeSummary[]>('/api/trees'),
)
</script>

<template>
  <section class="mx-auto max-w-4xl px-6 py-12">
    <p class="kicker text-rust">your forest</p>
    <h1 class="mt-2 font-serif text-4xl font-medium tracking-tight">Trees</h1>
    <p class="mt-3 max-w-xl text-ink-2">
      Every tree is a project's hardened truth. Open one to read its rings, or build new truths
      from your agent over MCP.
    </p>

    <div v-if="pending" class="mt-10 font-mono text-sm text-ink-2">loading…</div>

    <div v-else-if="error" class="mt-10 font-mono text-sm text-rust">
      could not load trees. is the backend running?
    </div>

    <div
      v-else-if="!trees || trees.length === 0"
      class="mt-10 rounded-sm border border-line bg-paper-2 p-8"
    >
      <h2 class="font-serif text-2xl font-medium">No trees yet.</h2>
      <p class="mt-2 max-w-md text-ink-2">
        Connect Heartwood to your agent, then create your first root truth. The
        <NuxtLink to="/docs" class="text-rust underline-offset-2 hover:underline">setup guide</NuxtLink>
        walks you through it in two minutes.
      </p>
    </div>

    <ul v-else class="mt-10 border-t-[1.5px] border-ink">
      <li v-for="tree in trees" :key="tree.treeId">
        <NuxtLink
          :to="`/app/trees/${encodeURIComponent(tree.treeId)}`"
          class="group flex items-center justify-between gap-4 border-b border-line py-5 transition-colors hover:bg-paper-2"
        >
          <div class="flex items-baseline gap-4">
            <span class="font-serif text-2xl font-medium text-ink">{{ tree.treeId }}</span>
            <span class="font-mono text-[0.7rem] text-ink-2">{{ tree.nodeCount }} truths</span>
          </div>
          <span class="font-mono text-[0.8rem] text-ink-2 transition-transform group-hover:translate-x-1"
            >open →</span
          >
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
