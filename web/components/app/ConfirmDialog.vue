<script setup lang="ts">
import { hardnessColor } from '~/types/tree'

export interface ConfirmState {
  title: string
  message: string
  affected: { id: string; label: string; effectiveHardness: number }[]
  danger: boolean
  confirmLabel: string
}

defineProps<{ state: ConfirmState; busy?: boolean }>()
defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" @click.self="$emit('cancel')">
    <div class="w-full max-w-md rounded-sm border-2 border-ink bg-paper p-6 shadow-2xl">
      <p class="kicker" :class="state.danger ? 'text-rust' : 'text-ink-2'">
        {{ state.danger ? 'this cannot be undone' : 'confirm the change' }}
      </p>
      <h2 class="mt-2 font-serif text-2xl font-medium tracking-tight">{{ state.title }}</h2>
      <p class="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{{ state.message }}</p>

      <div v-if="state.affected.length" class="mt-4">
        <p class="kicker text-ink-2">{{ state.affected.length }} affected</p>
        <ul class="mt-2 max-h-48 overflow-auto border-t border-line">
          <li
            v-for="a in state.affected"
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
          class="rounded-sm px-5 py-2 text-[0.88rem] font-semibold text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          :class="state.danger ? 'bg-rust' : 'bg-ink'"
          :disabled="busy"
          @click="$emit('confirm')"
        >
          {{ busy ? 'Working…' : state.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
