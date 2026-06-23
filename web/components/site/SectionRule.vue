<script setup lang="ts">
defineProps<{ n: string; title: string }>()
</script>

<template>
  <div class="mt-24 flex items-baseline gap-4 border-t-[1.5px] border-ink pt-3">
    <span class="font-mono text-[0.7rem] text-rust">{{ n }}</span>
    <span class="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-2">{{ title }}</span>
  </div>
</template>
