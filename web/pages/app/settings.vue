<script setup lang="ts">
definePageMeta({ layout: 'app', middleware: 'auth' })

const { user, fetchSession, signOut } = useSession()
if (!user.value) await fetchSession()
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-12">
    <p class="kicker text-rust">account</p>
    <h1 class="mt-2 font-serif text-4xl font-medium tracking-tight">Settings</h1>

    <dl class="mt-10 border-t-[1.5px] border-ink">
      <div class="flex items-baseline justify-between gap-4 border-b border-line py-4">
        <dt class="font-mono text-[0.72rem] uppercase tracking-wide text-ink-2">Name</dt>
        <dd class="text-ink">{{ user?.displayName ?? '—' }}</dd>
      </div>
      <div class="flex items-baseline justify-between gap-4 border-b border-line py-4">
        <dt class="font-mono text-[0.72rem] uppercase tracking-wide text-ink-2">Email</dt>
        <dd class="text-ink">{{ user?.email ?? '—' }}</dd>
      </div>
      <div class="flex items-baseline justify-between gap-4 border-b border-line py-4">
        <dt class="font-mono text-[0.72rem] uppercase tracking-wide text-ink-2">Sign-in</dt>
        <dd class="text-ink">GitHub</dd>
      </div>
    </dl>

    <button
      class="mt-8 rounded-sm border border-ink px-5 py-2 font-mono text-[0.85rem] hover:bg-ink hover:text-paper"
      @click="signOut"
    >
      Sign out
    </button>
  </section>
</template>
