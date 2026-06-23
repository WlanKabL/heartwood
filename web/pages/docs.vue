<script setup lang="ts">
useHead({ title: 'Heartwood — setup guide' })

const toc = [
  { id: 'token', label: '01 · Token' },
  { id: 'register', label: '02 · Register' },
  { id: 'build', label: '03 · Build the tree' },
  { id: 'hook', label: '04 · Auto-load roots' },
  { id: 'behaviour', label: '05 · How it behaves' },
]

const mcpAddDocs =
  'claude mcp add --transport http heartwood https://your-heartwood-host/mcp --header "Authorization: Bearer hw_your-token"'

const mcpJsonDocs = `{
  "mcpServers": {
    "heartwood": {
      "type": "http",
      "url": "https://your-heartwood-host/mcp",
      "headers": { "Authorization": "Bearer hw_your-token" }
    }
  }
}`

const hookDocs = `{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command",
        "command": "curl -s -H \\"Authorization: Bearer hw_your-token\\" https://your-heartwood-host/trees/my-project/roots" } ] }
    ]
  }
}`
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-16">
    <!-- hero -->
    <header class="max-w-3xl">
      <p class="kicker text-rust">field guide · setup</p>
      <h1 class="mt-3 font-serif text-[clamp(2.6rem,6vw,4.4rem)] font-medium leading-[1.02] tracking-tight">
        Connect once.<br />Then never re-explain your project.
      </h1>
      <p class="mt-5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-2">
        5 steps · ~2 minutes · any MCP agent · you never hand-build the tree
      </p>
    </header>

    <div class="mt-14 grid gap-12 lg:grid-cols-[170px_1fr]">
      <SiteDocToc :items="toc" />

      <div>
        <!-- 01 -->
        <section id="token" class="scroll-mt-24">
          <div class="flex items-baseline gap-4">
            <span class="font-mono text-2xl text-rust">01</span>
            <h2 class="font-serif text-[1.7rem] font-medium tracking-tight">Sign in, mint a token</h2>
          </div>
          <p class="mt-4 max-w-2xl leading-relaxed text-ink-2">
            Sign in with GitHub, open
            <NuxtLink to="/app/tokens" class="text-rust underline-offset-2 hover:underline">Tokens</NuxtLink>, and
            create one. The raw value is shown once, so copy it then. Only a hash is stored: a lost
            token is replaced, never recovered. That page also prints a ready command with your
            token already in it.
          </p>
        </section>

        <!-- 02 -->
        <section id="register" class="mt-14 scroll-mt-24 border-t border-line pt-12">
          <div class="flex items-baseline gap-4">
            <span class="font-mono text-2xl text-rust">02</span>
            <h2 class="font-serif text-[1.7rem] font-medium tracking-tight">Register the server</h2>
          </div>
          <p class="mt-4 max-w-2xl leading-relaxed text-ink-2">
            One line, and Claude Code registers Heartwood itself. The default scope keeps the token
            in your private config, out of the repo.
          </p>
          <div class="mt-4 max-w-2xl"><AppCopyBlock :code="mcpAddDocs" label="quick connect" /></div>
          <details class="mt-3 max-w-2xl">
            <summary class="cursor-pointer font-mono text-[0.74rem] text-ink-2 hover:text-ink">
              or wire it by hand in .mcp.json
            </summary>
            <div class="mt-2"><AppCopyBlock :code="mcpJsonDocs" label=".mcp.json" /></div>
          </details>
        </section>

        <!-- 03 -->
        <section id="build" class="mt-14 scroll-mt-24 border-t border-line pt-12">
          <div class="flex items-baseline gap-4">
            <span class="font-mono text-2xl text-rust">03</span>
            <h2 class="font-serif text-[1.7rem] font-medium tracking-tight">Let the agent build it</h2>
          </div>
          <p class="mt-4 max-w-2xl leading-relaxed text-ink-2">
            Open a fresh session and paste this. The agent interviews you, then creates the first
            roots and branches itself. You curate, you do not type nodes.
          </p>
          <div class="mt-4 max-w-2xl"><AppCopyBlock :code="bootstrapPrompt()" label="bootstrap prompt" /></div>
        </section>

        <!-- 04 -->
        <section id="hook" class="mt-14 scroll-mt-24 border-t border-line pt-12">
          <div class="flex items-baseline gap-4">
            <span class="font-mono text-2xl text-rust">04</span>
            <h2 class="font-serif text-[1.7rem] font-medium tracking-tight">Auto-load your roots</h2>
          </div>
          <p class="mt-4 max-w-2xl leading-relaxed text-ink-2">
            Optional, but it is the whole point. Point a SessionStart hook at your protected core
            so every new chat loads it first, before any task. In
            <code class="font-mono text-[0.9em]">.claude/settings.local.json</code>:
          </p>
          <div class="mt-4 max-w-2xl"><AppCopyBlock :code="hookDocs" label=".claude/settings.local.json" /></div>
        </section>

        <!-- 05 -->
        <section id="behaviour" class="mt-14 scroll-mt-24 border-t border-line pt-12">
          <div class="flex items-baseline gap-4">
            <span class="font-mono text-2xl text-rust">05</span>
            <h2 class="font-serif text-[1.7rem] font-medium tracking-tight">How the tree behaves</h2>
          </div>
          <div class="mt-4 max-w-2xl space-y-4 leading-relaxed text-ink-2">
            <p>
              Build deepest, most stable truths as roots, details below them. Hardness falls as you
              go deeper. It is computed server-side from a node's position and load; a proposed
              number is clamped into the structurally allowed band, never taken at face value.
            </p>
            <p>
              Changing a hard node is gated: the server shows the cascade it would invalidate, and
              the change proceeds only on explicit confirmation. Keep volatile data, prices, dates,
              metrics, versions, out of the tree entirely. The
              <NuxtLink to="/wiki" class="text-rust underline-offset-2 hover:underline">field notes</NuxtLink>
              go deeper.
            </p>
          </div>
          <a
            href="/auth/github"
            class="mt-8 inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3 text-[0.95rem] font-semibold text-paper transition-transform hover:-translate-y-0.5"
            >Sign in and start <span class="font-mono">→</span></a
          >
        </section>
      </div>
    </div>
  </div>
</template>
