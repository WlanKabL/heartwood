<script setup lang="ts">
const props = defineProps<{ code: string; label?: string }>()
const copied = ref(false)
const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="overflow-hidden rounded-sm border border-line bg-paper-2">
    <div class="flex items-center justify-between border-b border-line px-3 py-1.5">
      <span class="font-mono text-[0.62rem] uppercase tracking-wide text-ink-2">{{
        label ?? 'copy'
      }}</span>
      <button class="font-mono text-[0.7rem] text-rust transition-colors hover:text-ink" @click="copy">
        {{ copied ? 'copied ✓' : 'copy' }}
      </button>
    </div>
    <pre class="overflow-x-auto p-4 font-mono text-[0.76rem] leading-relaxed text-ink"><code>{{ code }}</code></pre>
  </div>
</template>
