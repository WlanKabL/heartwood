<script setup lang="ts">
const { user, signOut } = useSession()
const route = useRoute()

const nav = [
  { to: '/app', label: 'Trees', match: /^\/app$|^\/app\/trees/ },
  { to: '/app/tokens', label: 'Tokens', match: /^\/app\/tokens/ },
  { to: '/app/settings', label: 'Settings', match: /^\/app\/settings/ },
]
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header
      class="flex items-center justify-between gap-6 border-b-[1.5px] border-ink px-6 py-3 font-mono text-[0.7rem] uppercase tracking-[0.14em]"
    >
      <div class="flex items-center gap-8">
        <NuxtLink to="/" class="font-medium tracking-[0.3em] text-ink">Heartwood</NuxtLink>
        <nav class="flex gap-5">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="transition-colors"
            :class="item.match.test(route.path) ? 'text-ink' : 'text-ink-2 hover:text-ink'"
            >{{ item.label }}</NuxtLink
          >
        </nav>
      </div>
      <div class="flex items-center gap-4 text-ink-2">
        <span class="hidden normal-case tracking-normal sm:inline">{{ user?.email }}</span>
        <button class="text-rust transition-colors hover:text-ink" @click="signOut">Sign out</button>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
