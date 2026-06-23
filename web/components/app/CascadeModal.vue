<script setup lang="ts">
import type { CascadePreview } from '~/types/tree'
import { hardnessColor } from '~/types/tree'

defineProps<{ preview: CascadePreview; busy?: boolean }>()
defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" @click.self="$emit('cancel')">
    <div class="w-full max-w-md rounded-sm border-2 border-ink bg-paper p-6 shadow-2xl">
      <p class="kicker text-rust">the friction is the feature</p>
      <h2 class="mt-2 font-serif text-2xl font-medium tracking-tight">Confirm a hard change</h2>
      <p class="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{{ preview.reason }}</p>

      <div v-if="preview.affected.length" class="mt-4">
        <p class="kicker text-ink-2">{{ preview.affected.length }} affected</p>
        <ul class="mt-2 max-h-52 overflow-auto border-t border-line">
          <li
            v-for="a in preview.affected"
            :key="a.id"
            class="flex items-center justify-between gap-3 border-b border-line py-1.5"
          >
            <span class="font-mono text-[0.82rem] text-ink">{{ a.label }}</span>
            <span class="font-mono text-[0.7rem]" :style="{ color: hardnessColor(a.effectiveHardness) }">{{
              a.effectiveHardness
            }}</span>
          </li>
        </ul>
      </div>

      <div class="mt-6 flex items-center justify-end gap-3">
        <button
          class="font-mono text-[0.82rem] text-ink-2 hover:text-ink"
          :disabled="busy"
          @click="$emit('cancel')"
        >
          cancel
        </button>
        <button
          class="rounded-sm bg-rust px-5 py-2 text-[0.88rem] font-semibold text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          :disabled="busy"
          @click="$emit('confirm')"
        >
          {{ busy ? 'Working…' : 'Confirm change' }}
        </button>
      </div>
    </div>
  </div>
</template>
