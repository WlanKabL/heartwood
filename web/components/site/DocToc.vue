<script setup lang="ts">
const props = defineProps<{ items: { id: string; label: string }[] }>()

const active = ref(props.items[0]?.id ?? '')
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) active.value = e.target.id
    },
    { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
  )
  for (const it of props.items) {
    const el = document.getElementById(it.id)
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <nav class="sticky top-20 hidden self-start lg:block">
    <p class="kicker mb-3 text-ink-2">contents</p>
    <ul class="border-l border-line">
      <li v-for="it in items" :key="it.id">
        <a
          :href="`#${it.id}`"
          class="-ml-px block border-l-2 py-1 pl-4 font-mono text-[0.72rem] leading-snug transition-colors"
          :class="active === it.id ? 'border-rust text-ink' : 'border-transparent text-ink-2 hover:text-ink'"
          >{{ it.label }}</a
        >
      </li>
    </ul>
  </nav>
</template>
