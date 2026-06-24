<script setup lang="ts">
// Hero photo: drop a warm tree-trunk / bark macro into web/public/wood-hero.jpg.
// Free source (no attribution required): https://unsplash.com/s/photos/tree-trunk
// Until the file exists the band falls back to the layered wood gradient below.
// Dynamic src (not a static literal) so Vite does not try to resolve it at build
// time. If the file is absent the @error handler falls back to the wood gradient.
const heroSrc = '/wood-hero.jpg'
const heroImageMissing = ref(false)

const layers = [
  { label: 'roots', meta: 'what this fundamentally is', hardness: 92, depth: 0 },
  { label: 'trunk', meta: 'direction, brand, positioning', hardness: 74, depth: 1 },
  { label: 'branches', meta: 'features and capabilities', hardness: 52, depth: 2 },
  { label: 'leaves', meta: 'concrete, volatile details', hardness: 28, depth: 3 },
]

const ramp = (h: number): string => {
  if (h >= 85) return 'var(--color-h-4)'
  if (h >= 65) return 'var(--color-h-3)'
  if (h >= 45) return 'var(--color-h-2)'
  if (h >= 30) return 'var(--color-h-1)'
  return 'var(--color-h-0)'
}

const mcpSnippet = `{
  "mcpServers": {
    "heartwood": {
      "type": "http",
      "url": "https://heartwood.wlankabl.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_HW_TOKEN" }
    }
  }
}`
</script>

<template>
  <div>
    <!-- ============ HERO ============ -->
    <section class="relative grid lg:min-h-[88vh] lg:grid-cols-[38%_62%]">
      <!-- left: full-height material plate -->
      <div
        class="relative min-h-[42vh] overflow-hidden lg:min-h-0"
        style="
          background:
            radial-gradient(120% 70% at 30% 24%, #7c4f24, transparent 60%),
            linear-gradient(160deg, #5a3717, #2f1d0c 72%);
        "
      >
        <img
          v-show="!heroImageMissing"
          :src="heroSrc"
          alt=""
          class="absolute inset-0 h-full w-full object-cover"
          style="filter: saturate(0.86) contrast(1.02)"
          @error="heroImageMissing = true"
        />
        <div
          class="absolute inset-0"
          style="
            background: linear-gradient(180deg, rgba(60, 35, 15, 0.28), rgba(40, 22, 10, 0.5));
            mix-blend-mode: multiply;
          "
        ></div>
        <div class="absolute inset-0" style="box-shadow: inset -40px 0 80px rgba(20, 12, 5, 0.45)"></div>

        <span
          class="absolute left-6 top-6 font-mono text-[0.64rem] uppercase tracking-[0.34em] text-[#d9c39a]"
          style="writing-mode: vertical-rl"
          >Heartwood · specimen Nº 01</span
        >
        <div
          class="absolute bottom-6 left-6 font-mono text-[0.66rem] leading-relaxed text-[#e7d6b8]"
          style="text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5)"
        >
          FIG. 1 — <b class="font-medium text-white">keeperlog</b> · 52 truths, 7 roots<br />
          core unchanged since day one
        </div>
      </div>

      <!-- right: editorial column -->
      <div class="baseline relative flex flex-col px-6 py-10 sm:px-10 lg:py-12">
        <!-- mobile-only specimen disc, inline above the headline -->
        <div class="mb-6 w-[240px] drop-shadow-xl lg:hidden">
          <SiteSpecimenDisc />
        </div>

        <div class="mt-4 max-w-[34rem] py-6 lg:mt-10">
          <p class="kicker text-rust">01 / The problem with forgetful agents</p>
          <h1 class="mt-3 font-serif text-[clamp(2.8rem,6vw,5.2rem)] font-medium leading-[0.94] tracking-tight">
            Give your agents a <em class="italic">spine.</em>
          </h1>
          <p
            class="mt-6 max-w-[27rem] font-serif text-[clamp(1.05rem,1.5vw,1.32rem)] leading-relaxed text-ink-2 first-letter:float-left first-letter:pr-2 first-letter:font-serif first-letter:text-[3.1rem] first-letter:font-semibold first-letter:leading-[0.78] first-letter:text-rust"
          >
            An agent re-guesses what your project is on every task. Heartwood keeps the answer as
            a hardened tree of truths: the deeper a truth sits, the harder a passing prompt can
            bend it.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-6">
            <a
              href="/auth/github"
              class="inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3 text-[0.92rem] font-semibold text-paper transition-transform hover:-translate-y-0.5"
              >Plant your first tree <span class="font-mono">→</span></a
            >
            <a
              href="#model"
              class="border-b-[1.5px] border-line pb-1 font-mono text-[0.84rem] text-ink hover:border-ink"
              >read_the_concept</a
            >
          </div>
        </div>

        <!-- bottom index, like a table of contents -->
        <nav
          class="mt-auto grid grid-cols-2 gap-x-6 gap-y-3 border-t-[1.5px] border-ink pt-4 font-mono text-[0.66rem] text-ink-2 sm:grid-cols-4"
        >
          <a href="#model" class="block hover:text-ink"
            ><span class="text-rust">02</span> The model<br /><span class="text-[0.6rem] text-[#8a755a]"
              >roots → leaves</span
            ></a
          >
          <a href="#hardness" class="block hover:text-ink"
            ><span class="text-rust">03</span> Hardness<br /><span class="text-[0.6rem] text-[#8a755a]"
              >server decides</span
            ></a
          >
          <a href="#connect" class="block hover:text-ink"
            ><span class="text-rust">04</span> Connect<br /><span class="text-[0.6rem] text-[#8a755a]"
              >MCP in 2 min</span
            ></a
          >
          <a href="#proof" class="block hover:text-ink"
            ><span class="text-rust">05</span> Proof<br /><span class="text-[0.6rem] text-[#8a755a]"
              >dogfooded</span
            ></a
          >
        </nav>
      </div>

      <!-- lg specimen disc: straddles the seam in the lower zone, clear of the CTA -->
      <div
        class="pointer-events-none absolute z-20 hidden w-[300px] drop-shadow-xl lg:block"
        style="left: 21%; bottom: 8%"
      >
        <SiteSpecimenDisc />
      </div>
    </section>

    <!-- ============ 02 THE MODEL ============ -->
    <section id="model" class="mx-auto max-w-6xl px-6">
      <SiteSectionRule n="02" title="The model" />
      <div class="mt-8 grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div class="max-w-[34rem]">
          <h2 class="font-serif text-[clamp(1.9rem,3.5vw,2.9rem)] font-medium leading-tight tracking-tight">
            A project's truth is a tree.
          </h2>
          <p class="mt-5 text-[1.05rem] leading-relaxed text-ink-2">
            Heartwood is the model itself. Heartwood is the innermost, oldest part of a tree:
            the dead, hard core that carries the whole trunk. Outer rings harden inward over
            years. Here too, age becomes hardness, the core bears everything, layers harden over
            time.
          </p>
          <p class="mt-4 text-[1.05rem] leading-relaxed text-ink-2">
            Depth is a single axis on which four things meet. The deeper a truth sits, the more
            authoritative it is against a prompt, the more stable over time, the more expensive
            to change, and the more immutable in daily work. The placement question is simple:
            how often does this honestly change? Never goes to the roots. Every sprint is a leaf.
          </p>
        </div>

        <!-- depth scale, not four equal cards -->
        <div class="font-mono">
          <p class="kicker mb-4 text-ink-2">depth → hardness</p>
          <div
            v-for="(l, i) in layers"
            :key="l.label"
            class="flex items-center gap-4 border-t border-line py-3"
            :style="{ paddingLeft: `${i * 0.9}rem` }"
          >
            <span class="h-3 w-3 shrink-0 rounded-full" :style="{ background: ramp(l.hardness) }"></span>
            <span class="w-20 text-[0.92rem] font-medium text-ink">{{ l.label }}</span>
            <span class="flex-1 text-[0.72rem] text-ink-2">{{ l.meta }}</span>
            <span class="text-[0.78rem] text-rust">{{ l.hardness }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 03 HARDNESS / IRON RULE ============ -->
    <section id="hardness" class="mx-auto max-w-6xl px-6">
      <SiteSectionRule n="03" title="Hardness · the iron rule" />
      <div class="mt-8 grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <blockquote
          class="font-serif text-[clamp(1.8rem,3.6vw,3rem)] font-medium leading-[1.08] tracking-tight"
        >
          AI proposes.<br /><span class="text-rust">Server enforces.</span>
        </blockquote>
        <div class="max-w-[34rem]">
          <p class="text-[1.05rem] leading-relaxed text-ink-2">
            A node's hardness is computed server-side from where it hangs and how much hangs
            below it. Structure is the backbone and the ceiling. A human or an agent may propose
            a number, and the server clamps it into the structurally allowed band. It can nudge,
            never override.
          </p>
          <p class="mt-4 text-[1.05rem] leading-relaxed text-ink-2">
            Tell an agent your tool is hospital software and the root pushes back instead of
            going along. Changing a hard node is blocked until a human confirms with the cascade
            shown: this invalidates these twelve children, confirm. The friction is the feature.
          </p>
        </div>
      </div>
    </section>

    <!-- ============ 04 CONNECT ============ -->
    <section id="connect" class="mx-auto max-w-6xl px-6">
      <SiteSectionRule n="04" title="Connect in two minutes" />
      <div class="mt-8 grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
        <div class="max-w-[30rem]">
          <h2 class="font-serif text-[clamp(1.7rem,3vw,2.5rem)] font-medium leading-tight tracking-tight">
            One token, any runtime.
          </h2>
          <p class="mt-5 text-[1.05rem] leading-relaxed text-ink-2">
            Sign in with GitHub, mint an API token, and paste it into your agent's MCP config.
            The same tree is served to every runtime that speaks MCP. Point a SessionStart hook
            at your roots and every new chat loads your protected core first.
          </p>
          <a
            href="/docs"
            class="mt-6 inline-block border-b-[1.5px] border-line pb-1 font-mono text-[0.84rem] text-ink hover:border-ink"
            >full_setup_guide →</a
          >
        </div>
        <pre
          class="overflow-x-auto rounded-sm border border-line bg-paper-2 p-5 font-mono text-[0.78rem] leading-relaxed text-ink"
        ><code>{{ mcpSnippet }}</code></pre>
      </div>
    </section>

    <!-- ============ 05 PROOF ============ -->
    <section id="proof" class="mx-auto max-w-6xl px-6">
      <SiteSectionRule n="05" title="Proof · dogfooded" />
      <div class="mt-8 max-w-[40rem]">
        <p class="font-serif text-[clamp(1.4rem,2.6vw,2.1rem)] font-medium leading-snug tracking-tight">
          Heartwood is the first example of what it manages. Its own roots live in its repo, and
          it is dogfooded against two real products: KeeperLog and ZentraX.
        </p>
        <p class="mt-5 text-[1.05rem] leading-relaxed text-ink-2">
          If Heartwood does not visibly make those two move faster, it has failed its own thesis.
          That is the bar.
        </p>
      </div>

      <!-- CTA close -->
      <div class="mb-24 mt-14 flex flex-wrap items-center gap-6 border-t-[1.5px] border-ink pt-10">
        <a
          href="/auth/github"
          class="inline-flex items-center gap-2 rounded-sm bg-ink px-7 py-3.5 text-[0.95rem] font-semibold text-paper transition-transform hover:-translate-y-0.5"
          >Plant your first tree <span class="font-mono">→</span></a
        >
        <span class="font-mono text-[0.78rem] text-ink-2">free, open source, self-hostable</span>
      </div>
    </section>
  </div>
</template>
