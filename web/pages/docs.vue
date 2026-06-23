<script setup lang="ts">
useHead({ title: 'Heartwood — setup guide' })

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
  <article class="mx-auto max-w-3xl px-6 py-16">
    <p class="kicker text-rust">setup guide</p>
    <h1 class="mt-2 font-serif text-[clamp(2.4rem,5vw,3.6rem)] font-medium leading-tight tracking-tight">
      Connect Heartwood in two minutes.
    </h1>
    <p class="mt-4 max-w-xl font-serif text-lg leading-relaxed text-ink-2">
      You need a project, a GitHub account, and an agent that speaks MCP (Claude Code is the
      reference). You will not hand-build the tree. You connect once, then an agent grows it.
    </p>

    <SiteSectionRule n="01" title="Sign in and mint a token" />
    <p class="mt-5 leading-relaxed text-ink-2">
      Sign in with GitHub, open the
      <NuxtLink to="/app/tokens" class="text-rust underline-offset-2 hover:underline">Tokens</NuxtLink>
      page, and create a token. The raw value is shown once, so copy it then. Only a hash is
      stored, so a lost token is replaced, never recovered.
    </p>
    <p class="mt-3 leading-relaxed text-ink-2">
      The Tokens page also prints a ready command with your token already in it. The blocks below
      use placeholders you can fill by hand if you prefer.
    </p>

    <SiteSectionRule n="02" title="Register the server" />
    <p class="mt-5 leading-relaxed text-ink-2">
      One line and Claude Code registers Heartwood itself. The default scope keeps the token in
      your private config, out of the repo.
    </p>
    <div class="mt-4"><AppCopyBlock :code="mcpAddDocs" label="quick connect" /></div>
    <p class="mt-5 leading-relaxed text-ink-2">Prefer to do it by hand? Drop this into your project's <code class="font-mono text-[0.9em]">.mcp.json</code>:</p>
    <div class="mt-4"><AppCopyBlock :code="mcpJsonDocs" label=".mcp.json" /></div>

    <SiteSectionRule n="03" title="Let the agent build the tree" />
    <p class="mt-5 leading-relaxed text-ink-2">
      Open a fresh Claude Code session, then paste this. The agent interviews you and creates the
      first roots and branches itself.
    </p>
    <div class="mt-4"><AppCopyBlock :code="bootstrapPrompt()" label="bootstrap prompt" /></div>

    <SiteSectionRule n="04" title="Auto-load your roots (optional)" />
    <p class="mt-5 leading-relaxed text-ink-2">
      Point a SessionStart hook at your protected core so every new chat loads it first, before
      any task. In <code class="font-mono text-[0.9em]">.claude/settings.local.json</code>:
    </p>
    <div class="mt-4"><AppCopyBlock :code="hookDocs" label=".claude/settings.local.json" /></div>

    <SiteSectionRule n="05" title="How the tree behaves" />
    <div class="mt-5 space-y-4 leading-relaxed text-ink-2">
      <p>
        Build deepest, most stable truths as roots, and details below them. Watch the hardness
        fall as you go deeper. A node's hardness is computed server-side from where it hangs and
        how much hangs below it. A proposed number is clamped into the structurally allowed band,
        never taken at face value.
      </p>
      <p>
        Changing a hard node is gated: the server shows the cascade it would invalidate, and the
        change proceeds only on explicit confirmation. The friction is the feature. Keep volatile
        data, prices, dates, metrics, version numbers, out of the tree entirely.
      </p>
      <p>
        The deeper questions, what hardness really is and why a prompt can never re-rate it, live
        in the <NuxtLink to="/wiki" class="text-rust underline-offset-2 hover:underline">field notes</NuxtLink>.
      </p>
    </div>

    <div class="mt-14 border-t-[1.5px] border-ink pt-8">
      <a
        href="/auth/github"
        class="inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3 text-[0.95rem] font-semibold text-paper transition-transform hover:-translate-y-0.5"
        >Sign in and start <span class="font-mono">→</span></a
      >
    </div>
  </article>
</template>
