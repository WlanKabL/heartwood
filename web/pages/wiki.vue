<script setup lang="ts">
useHead({ title: 'Heartwood — field notes' })

interface Faq {
  q: string
  a: string[]
}
const faqs: Faq[] = [
  {
    q: 'What is hardness?',
    a: [
      'A number from 0 to 100 the server computes for every node from where it hangs and how much hangs below it. It is not a level label. With several roots and load-bearing nodes, a depth-one trunk can legitimately be harder than a shallow root, so the structural level lives in depthFromRoot and how hard a truth is lives in effectiveHardness.',
    ],
  },
  {
    q: 'Why can the AI not just set the hardness?',
    a: [
      'Because a number is trivial for an AI to assert, and a clever prompt would talk an agent into treating a root as soft. Topology, where a node hangs and what hangs below it, is a structural fact a prompt cannot talk away.',
      'So an AI may propose a hardness for a new node, and the server clamps that proposal into the structurally allowed band. It can nudge, never override. AI proposes, server enforces.',
    ],
  },
  {
    q: 'What does protected mean?',
    a: [
      'A node is protected once its effectiveHardness reaches 60. Changing a protected node is blocked until you see the cascade it would invalidate and confirm explicitly. The most dangerous person who can say yes is the founder at 2am, so the system makes them look at what they are about to break.',
    ],
  },
  {
    q: 'What is a cascade preview?',
    a: [
      'Before a hard change, the server lists what hangs on the node, the descendants the change would invalidate, and asks you to confirm. The friction is the feature, not the bug.',
    ],
  },
  {
    q: 'What belongs in the tree, and what does not?',
    a: [
      'Durable truths only. If a piece of content would be wrong in a few months, a price, a metric, a percentage, a current number, a version, it belongs in a decision record, not in the tree. One node is one truth. Keep sibling nodes at a similar level of detail.',
    ],
  },
  {
    q: 'Can a tree have several roots?',
    a: [
      'Yes. A tree is a forest: several top-level truths are allowed, and each root is its own strand. Give a distinct theme its own root instead of overloading an unrelated parent.',
    ],
  },
  {
    q: 'Is my data isolated from other accounts?',
    a: [
      'Yes. Every read and every write is scoped to your account. A token only ever resolves to its owner, two tenants never see each other’s trees, and isolation is enforced at the boundary, not left to convention.',
    ],
  },
  {
    q: 'Which runtimes does it work with?',
    a: [
      'Anything that speaks MCP over HTTP. Heartwood is the knowledge layer underneath your agents; it layers on existing runtimes like Claude Code rather than replacing them. It is not itself an agent runtime, and not a prompt pack.',
    ],
  },
  {
    q: 'Do I have to build the tree by hand?',
    a: [
      'No. Connect an agent, paste the bootstrap prompt, and it interviews you and creates the first roots and branches itself. You curate and confirm the hard changes. The visual editor is there when you want to prune or reshape by hand.',
    ],
  },
  {
    q: 'Why the name Heartwood?',
    a: [
      'Heartwood is the innermost, oldest part of a tree: the dead, hard core that carries the whole trunk. Outer rings harden inward over years. Here too, age becomes hardness, the core bears everything, and layers harden over time.',
    ],
  },
]
</script>

<template>
  <article class="mx-auto max-w-4xl px-6 py-16">
    <p class="kicker text-rust">field notes</p>
    <h1 class="mt-2 font-serif text-[clamp(2.4rem,5vw,3.6rem)] font-medium leading-tight tracking-tight">
      How the tree thinks.
    </h1>
    <p class="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-ink-2">
      A project's truth is a tree: roots are the few unchangeable truths, the trunk is direction
      and brand, branches are features, leaves are volatile detail. Depth is a single axis on
      which four things meet. The deeper a truth sits, the more authoritative it is against a
      prompt, the more stable over time, the more expensive to change, and the more immutable in
      daily work.
    </p>

    <SiteSectionRule n="∗" title="Questions" />

    <div class="mt-8 divide-y divide-line border-t border-line">
      <section
        v-for="(faq, i) in faqs"
        :key="i"
        class="grid gap-4 py-8 lg:grid-cols-[0.8fr_1.2fr]"
      >
        <h2 class="font-serif text-xl font-medium leading-snug tracking-tight">{{ faq.q }}</h2>
        <div class="space-y-3">
          <p v-for="(p, j) in faq.a" :key="j" class="leading-relaxed text-ink-2">{{ p }}</p>
        </div>
      </section>
    </div>

    <div class="mt-12 flex flex-wrap items-center gap-6 border-t-[1.5px] border-ink pt-8">
      <NuxtLink
        to="/docs"
        class="inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3 text-[0.95rem] font-semibold text-paper transition-transform hover:-translate-y-0.5"
        >Read the setup guide <span class="font-mono">→</span></NuxtLink
      >
      <a href="/auth/github" class="font-mono text-[0.84rem] text-ink hover:text-rust">or sign in →</a>
    </div>
  </article>
</template>
