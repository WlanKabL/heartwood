<template>
  <div class="flex min-h-screen flex-col">
    <header
      class="flex items-baseline justify-between border-b-[1.5px] border-ink px-6 py-3 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-2"
    >
      <NuxtLink to="/" class="font-medium tracking-[0.3em] text-ink">Heartwood</NuxtLink>
      <span class="hidden sm:inline">Truth engine for AI agents</span>
      <nav class="flex gap-4">
        <NuxtLink to="/docs" class="transition-colors hover:text-ink">Docs</NuxtLink>
        <NuxtLink to="/wiki" class="transition-colors hover:text-ink">Wiki</NuxtLink>
        <a href="/auth/github" class="text-rust transition-colors hover:text-ink">Sign in</a>
      </nav>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer
      class="flex flex-wrap justify-between gap-x-8 gap-y-2 border-t-[1.5px] border-ink px-6 py-8 font-mono text-[0.66rem] tracking-[0.08em] text-ink-2"
    >
      <span>Heartwood · 2026 · Nº 01</span>
      <span class="flex gap-6">
        <a
          href="https://github.com/WlanKabL/heartwood"
          class="transition-colors hover:text-ink"
          target="_blank"
          rel="noreferrer"
          >GitHub</a
        >
        <a
          href="https://wlankabl.dev"
          class="transition-colors hover:text-ink"
          target="_blank"
          rel="noreferrer"
          >Portfolio</a
        >
      </span>
    </footer>
  </div>
</template>
