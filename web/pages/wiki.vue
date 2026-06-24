<script setup lang="ts">
useHead({ title: 'Heartwood — field notes' })

interface Faq {
  id: string
  toc: string
  q: string
  a: string[]
}
const faqs: Faq[] = [
  {
    id: 'hardness',
    toc: 'Hardness',
    q: 'What is hardness?',
    a: [
      'A number from 0 to 100 the server computes for every node from where it hangs and how much hangs below it. It is not a level label: with several roots and load-bearing nodes, a depth-one trunk can be harder than a shallow root. The structural level lives in depthFromRoot; how hard a truth is lives in effectiveHardness.',
    ],
  },
  {
    id: 'proposes',
    toc: 'Why not the AI',
    q: 'Why can the AI not just set the hardness?',
    a: [
      'A number is trivial for an AI to assert, and a clever prompt would talk an agent into treating a root as soft. Topology, where a node hangs and what hangs below it, is a structural fact a prompt cannot talk away.',
      'So an AI may propose a hardness for a new node, and the server clamps that proposal into the structurally allowed band. It nudges, never overrides. AI proposes, server enforces.',
    ],
  },
  {
    id: 'protected',
    toc: 'Protected',
    q: 'What does protected mean?',
    a: [
      'A node is protected once its hardness reaches 60. Changing it is blocked until you see the cascade it would invalidate and confirm explicitly. The most dangerous person who can say yes is the founder at 2am, so the system makes them look at what they are about to break.',
    ],
  },
  {
    id: 'cascade',
    toc: 'Cascade',
    q: 'What is a cascade preview?',
    a: [
      'Before a hard change, the server lists the descendants the change would invalidate and asks you to confirm. The friction is the feature, not the bug.',
    ],
  },
  {
    id: 'belongs',
    toc: 'What belongs',
    q: 'What belongs in the tree, and what does not?',
    a: [
      'Durable truths only. If a piece of content would be wrong in a few months, a price, a metric, a date, a version, it belongs in a decision record, not the tree. One node is one truth, and sibling nodes stay at a similar level of detail.',
    ],
  },
  {
    id: 'forest',
    toc: 'Several roots',
    q: 'Can a tree have several roots?',
    a: [
      'Yes. A tree is a forest: several top-level truths are allowed, each its own strand. Give a distinct theme its own root instead of overloading an unrelated parent.',
    ],
  },
  {
    id: 'isolation',
    toc: 'Isolation',
    q: 'Is my data isolated from other accounts?',
    a: [
      'Yes. Every read and write is scoped to your account. A token only ever resolves to its owner, two tenants never see each other’s trees, and isolation is enforced at the boundary, not left to convention.',
    ],
  },
  {
    id: 'runtimes',
    toc: 'Runtimes',
    q: 'Which runtimes does it work with?',
    a: [
      'Anything that speaks MCP over HTTP. Heartwood is the knowledge layer underneath your agents; it layers on existing runtimes like Claude Code rather than replacing them. It is not an agent runtime, and not a prompt pack.',
    ],
  },
  {
    id: 'byhand',
    toc: 'By hand?',
    q: 'Do I have to build the tree by hand?',
    a: [
      'No. Connect an agent, paste the bootstrap prompt, and it interviews you and creates the first roots and branches itself. You curate and confirm the hard changes. The visual editor is there when you want to prune or reshape.',
    ],
  },
  {
    id: 'name',
    toc: 'The name',
    q: 'Why the name Heartwood?',
    a: [
      'Heartwood is the innermost, oldest part of a tree: the dead, hard core that carries the whole trunk. Age becomes hardness, the core bears everything, layers harden over time.',
    ],
  },
]
const toc = faqs.map((f) => ({ id: f.id, label: f.toc }))
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-16">
    <!-- hero -->
    <header class="flex flex-col items-start gap-8 sm:flex-row sm:items-center">
      <div class="flex-1">
        <p class="kicker text-rust">field notes</p>
        <h1 class="mt-3 font-serif text-[clamp(2.6rem,6vw,4.2rem)] font-medium leading-[1.02] tracking-tight">
          How the tree thinks.
        </h1>
        <p class="mt-5 max-w-xl font-serif text-lg leading-relaxed text-ink-2">
          Roots are the few unchangeable truths, the trunk is direction, branches are features,
          leaves are volatile detail. Depth is one axis where four things meet: authority against a
          prompt, stability over time, cost to change, and immutability in daily work.
        </p>
      </div>
      <div class="w-full max-w-[300px] self-center sm:w-[300px] sm:shrink-0">
        <SiteSpecimenDisc />
      </div>
    </header>

    <div class="mt-16 grid gap-12 lg:grid-cols-[170px_1fr]">
      <SiteDocToc :items="toc" />

      <div class="min-w-0 border-t border-line">
        <details
          v-for="faq in faqs"
          :id="faq.id"
          :key="faq.id"
          class="group scroll-mt-24 border-b border-line py-5"
        >
          <summary class="flex cursor-pointer items-start justify-between gap-6">
            <h2 class="font-serif text-xl font-medium leading-snug tracking-tight sm:text-2xl">
              {{ faq.q }}
            </h2>
            <span class="mt-1 font-mono text-xl text-ink-2 transition-transform group-open:rotate-45"
              >+</span
            >
          </summary>
          <div class="mt-4 max-w-2xl space-y-3 leading-relaxed text-ink-2">
            <p v-for="(p, j) in faq.a" :key="j">{{ p }}</p>
          </div>
        </details>

        <div class="mt-12 flex flex-wrap items-center gap-6">
          <NuxtLink
            to="/docs"
            class="inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3 text-[0.95rem] font-semibold text-paper transition-transform hover:-translate-y-0.5"
            >Read the setup guide <span class="font-mono">→</span></NuxtLink
          >
          <a href="/auth/github" class="font-mono text-[0.84rem] text-ink hover:text-rust">or sign in →</a>
        </div>
      </div>
    </div>
  </div>
</template>
