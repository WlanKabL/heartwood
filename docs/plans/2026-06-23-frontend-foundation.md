# Frontend Foundation + Landing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Nuxt 4 frontend app in `web/`, the warm "field guide" design system, a session-authed REST read API for trees, and the landing page, so `pnpm dev` shows a real marketing site backed by live tree data.

**Architecture:** A new `web/` Nuxt 4 app, fully decoupled from `src/`, talks same-origin to the existing Fastify backend. In dev, Nuxt proxies `/api`, `/auth`, `/mcp`, `/trees` to the backend on `:8722`. A new `src/http/tree-routes.ts` adapter exposes the read use-cases the MCP server already uses (`getResolvedTree`, `listTreeSummaries`, `searchTruths`), authed by the browser session cookie, registered with one line in `src/http/server.ts`. We import core functions; we never edit core (the V2 agent owns it).

**Tech Stack:** Nuxt 4, Vue 3, Tailwind CSS v4 (`@tailwindcss/vite`), Fraunces + Inter + JetBrains Mono, Fastify, Drizzle, Postgres, vitest.

**Scope of this plan:** the foundation only. Auth/token screens (Plan 2), the tree viewer (Plan 3), the editor + write endpoints (Plan 4), docs/wiki (Plan 5), and the Docker/nginx productionization (Plan 6) are separate plans listed at the end.

**Prerequisites for running anything here:**
- Postgres up: `docker compose up -d db` (the existing `db` service).
- Backend running for the frontend dev proxy: `pnpm dev` in the repo root (listens on `:8722`).
- Node >= 22, pnpm 10.

---

## File structure (this plan)

- `src/http/tree-routes.ts` — **new.** Session-authed REST read adapter over the core read use-cases. One responsibility: HTTP read access to trees for the browser.
- `src/http/tree-routes.test.ts` — **new.** Route + tenant-isolation tests, mirroring `api-routes.test.ts`.
- `src/http/server.ts` — **modify.** One `registerTreeRoutes(app, { treeStore: deps.treeStore })` line.
- `web/` — **new Nuxt app.** `package.json`, `nuxt.config.ts`, `assets/css/main.css` (design tokens), `app.vue`, `layouts/default.vue`, `components/site/*`, `pages/index.vue`, `public/` (placeholder imagery).

---

## Task 1: REST read adapter — `GET /api/trees`

**Files:**
- Create: `src/http/tree-routes.ts`
- Create: `src/http/tree-routes.test.ts`
- Modify: `src/http/server.ts`

- [ ] **Step 1: Write the failing test.** Create `src/http/tree-routes.test.ts`. Mirror the harness in `src/http/api-routes.test.ts` (cookie + secure-session + a `/test-login/:userId` route), but register `registerTreeRoutes` with a real `PostgresTreeStore`, and seed nodes through `treeStore.forUser(...).insertNode(...)`.

```ts
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifySecureSession from '@fastify/secure-session'
import { setupPostgresTests, getDb, getUserA, getUserB } from '../storage/postgres-test-setup.js'
import { setUserSession } from '../auth/session.js'
import { PostgresTreeStore } from '../storage/postgres-trees.js'
import { registerTreeRoutes } from './tree-routes.js'
import type { TreeNode } from '../core/types.js'

const sessionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest()
const SESSION_SECRET = 'test-secret-must-be-at-least-32-characters'
const fixedNow = (): Date => new Date('2026-01-01T00:00:00.000Z')

setupPostgresTests()

const buildApp = () => {
  const app = Fastify()
  app.register(fastifyCookie)
  app.register(fastifySecureSession, { key: sessionKey(SESSION_SECRET) })
  app.get<{ Params: { userId: string } }>('/test-login/:userId', async (request, reply) => {
    setUserSession(reply, request.params.userId)
    return reply.code(200).send({ ok: true })
  })
  registerTreeRoutes(app, { treeStore: new PostgresTreeStore(getDb()), now: fixedNow })
  return app
}

const loginAs = async (app: ReturnType<typeof buildApp>, userId: string): Promise<string> => {
  const res = await app.inject({ method: 'GET', url: `/test-login/${userId}` })
  const raw = res.headers['set-cookie']
  const header = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return header.split(';')[0] ?? ''
}

const node = (over: Partial<TreeNode> & Pick<TreeNode, 'id' | 'treeId' | 'label' | 'content'>): TreeNode => ({
  parentId: null, hardnessSet: null, status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  lastConfirmedAt: '2026-01-01T00:00:00.000Z', ...over,
})

describe('GET /api/trees', () => {
  it('returns the session user tree summaries', async () => {
    const app = buildApp()
    await app.ready()
    const repo = new PostgresTreeStore(getDb()).forUser(getUserA())
    await repo.insertNode(node({ id: 'a1', treeId: 'keeperlog', label: 'identity', content: 'x' }))
    await repo.insertNode(node({ id: 'a2', treeId: 'keeperlog', parentId: 'a1', label: 'voice', content: 'y' }))

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ treeId: string; nodeCount: number }[]>()
    expect(body).toEqual([{ treeId: 'keeperlog', nodeCount: 2 }])
    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/api/trees' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('never shows another user trees', async () => {
    const app = buildApp()
    await app.ready()
    await new PostgresTreeStore(getDb()).forUser(getUserB())
      .insertNode(node({ id: 'b1', treeId: 'keeperlog', label: 'identity', content: 'b-secret' }))

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees', headers: { cookie } })
    expect(res.json()).toEqual([])
    await app.close()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails.** Run: `pnpm test -- tree-routes`. Expected: FAIL with "Cannot find module './tree-routes.js'".

- [ ] **Step 3: Write the adapter.** Create `src/http/tree-routes.ts`. It mirrors the `requireSession` preHandler from `api-routes.ts` and delegates to the core service read use-cases.

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getUserSession } from '../auth/session.js'
import { getResolvedTree, getResolvedSubtree, listTreeSummaries, searchTruths } from '../core/service.js'
import type { TreeStore } from '../core/repository.js'

declare module 'fastify' {
  interface FastifyRequest {
    treeUserId: string
  }
}

export interface TreeRouteDeps {
  treeStore: TreeStore
  now: () => Date
}

const requireSession =
  () =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = getUserSession(request)
    if (userId === null) {
      await reply.code(401).send({ error: 'unauthorized' })
      return
    }
    request.treeUserId = userId
  }

export const registerTreeRoutes = (app: FastifyInstance, deps: TreeRouteDeps): void => {
  app.decorateRequest('treeUserId', '')
  const guard = requireSession()
  const repoFor = (request: FastifyRequest) => deps.treeStore.forUser(request.treeUserId)

  // GET /api/trees
  app.get('/api/trees', { preHandler: guard }, async (request, reply) => {
    return reply.send(await listTreeSummaries(repoFor(request)))
  })
}
```

- [ ] **Step 4: Wire it into the server.** In `src/http/server.ts`, add the import and the registration line next to `registerApiRoutes`.

```ts
// add near the other route imports
import { registerTreeRoutes } from './tree-routes.js'

// add right after `registerApiRoutes(app, { db: deps.db })`
registerTreeRoutes(app, { treeStore: deps.treeStore, now: deps.now })
```

- [ ] **Step 5: Run the test, verify it passes.** Run: `pnpm test -- tree-routes`. Expected: PASS (3 tests). Then `pnpm typecheck`. Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add src/http/tree-routes.ts src/http/tree-routes.test.ts src/http/server.ts
git commit -m "feat: GET /api/trees session-authed tree summaries"
```

---

## Task 2: REST read adapter — `GET /api/trees/:treeId` and search

**Files:**
- Modify: `src/http/tree-routes.ts`
- Modify: `src/http/tree-routes.test.ts`

- [ ] **Step 1: Write the failing tests.** Append to `src/http/tree-routes.test.ts`:

```ts
describe('GET /api/trees/:treeId', () => {
  it('returns the resolved nested forest with hardness', async () => {
    const app = buildApp()
    await app.ready()
    const repo = new PostgresTreeStore(getDb()).forUser(getUserA())
    await repo.insertNode(node({ id: 'r', treeId: 'kl', label: 'identity', content: 'root' }))
    await repo.insertNode(node({ id: 'c', treeId: 'kl', parentId: 'r', label: 'leaf', content: 'child' }))

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    const forest = res.json<{ id: string; effectiveHardness: number; protected: boolean; children: unknown[] }[]>()
    expect(forest).toHaveLength(1)
    expect(forest[0]!.id).toBe('r')
    expect(typeof forest[0]!.effectiveHardness).toBe('number')
    expect(forest[0]!.children).toHaveLength(1)
    await app.close()
  })

  it('returns an empty forest for another user tree (isolation)', async () => {
    const app = buildApp()
    await app.ready()
    await new PostgresTreeStore(getDb()).forUser(getUserB())
      .insertNode(node({ id: 'b', treeId: 'kl', label: 'identity', content: 'b-secret' }))
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl', headers: { cookie } })
    expect(res.json()).toEqual([])
    await app.close()
  })

  it('returns 401 without a session', async () => {
    const app = buildApp()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

describe('GET /api/trees/:treeId/search', () => {
  it('returns matching resolved nodes', async () => {
    const app = buildApp()
    await app.ready()
    const repo = new PostgresTreeStore(getDb()).forUser(getUserA())
    await repo.insertNode(node({ id: 'r', treeId: 'kl', label: 'identity', content: 'hospital software' }))
    await repo.insertNode(node({ id: 'c', treeId: 'kl', parentId: 'r', label: 'voice', content: 'calm tone' }))

    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl/search?q=calm', headers: { cookie } })

    expect(res.statusCode).toBe(200)
    const hits = res.json<{ id: string }[]>()
    expect(hits.map((h) => h.id)).toEqual(['c'])
    await app.close()
  })

  it('returns 400 when q is missing', async () => {
    const app = buildApp()
    await app.ready()
    const cookie = await loginAs(app, getUserA())
    const res = await app.inject({ method: 'GET', url: '/api/trees/kl/search', headers: { cookie } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
```

- [ ] **Step 2: Run, verify failure.** Run: `pnpm test -- tree-routes`. Expected: the new tests FAIL (404 / route not found).

- [ ] **Step 3: Add the routes.** In `src/http/tree-routes.ts`, inside `registerTreeRoutes`, add after the `/api/trees` route:

```ts
  // GET /api/trees/:treeId
  app.get<{ Params: { treeId: string } }>(
    '/api/trees/:treeId',
    { preHandler: guard },
    async (request, reply) => {
      return reply.send(await getResolvedTree(repoFor(request), request.params.treeId, deps.now()))
    },
  )

  // GET /api/trees/:treeId/search?q=...
  app.get<{ Params: { treeId: string }; Querystring: { q?: string } }>(
    '/api/trees/:treeId/search',
    { preHandler: guard },
    async (request, reply) => {
      const q = request.query.q
      if (!q || q.trim() === '') return reply.code(400).send({ error: 'query q is required' })
      return reply.send(await searchTruths(repoFor(request), request.params.treeId, q, deps.now()))
    },
  )
```

Note: `getResolvedSubtree` is imported for Plan 3/4 use; if the linter flags it as unused now, drop it from the import until needed.

- [ ] **Step 4: Run, verify pass.** Run: `pnpm test -- tree-routes`. Expected: PASS (all). Then `pnpm typecheck`.

- [ ] **Step 5: Commit.**

```bash
git add src/http/tree-routes.ts src/http/tree-routes.test.ts
git commit -m "feat: GET tree + search read endpoints"
```

---

## Task 3: Scaffold the Nuxt 4 app

**Files:** all new under `web/`.

- [ ] **Step 1: Create `web/package.json`.**

```json
{
  "name": "heartwood-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev --port 3000",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview"
  },
  "dependencies": {
    "nuxt": "^4.0.0",
    "vue": "^3.5.0",
    "vue-router": "^4.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "d3-hierarchy": "^3.1.2",
    "d3-shape": "^3.2.0",
    "@types/d3-hierarchy": "^3.1.7",
    "@types/d3-shape": "^3.1.7"
  }
}
```

- [ ] **Step 2: Create `web/nuxt.config.ts`** — dev proxy to the backend, prerender rules, Tailwind via Vite, fonts, app head.

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-23',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Heartwood — a truth engine for AI agents',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,400;9..144,0,500;9..144,0,600;9..144,1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
        },
      ],
      meta: [
        { name: 'description', content: 'Heartwood stores what your project actually is as a hardened tree of truths and serves it to every AI agent.' },
      ],
    },
  },
  // App routes are client-only; marketing routes are prerendered (Plan 5 adds /docs, /wiki).
  routeRules: {
    '/': { prerender: true },
    '/app/**': { ssr: false },
  },
  // Dev only: proxy backend paths so the SPA is same-origin in development.
  nitro: {
    devProxy: {
      '/api': { target: 'http://localhost:8722/api', changeOrigin: true },
      '/auth': { target: 'http://localhost:8722/auth', changeOrigin: true },
      '/trees': { target: 'http://localhost:8722/trees', changeOrigin: true },
      '/mcp': { target: 'http://localhost:8722/mcp', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 3: Create `web/assets/css/main.css`** — the design tokens as a Tailwind v4 `@theme`, plus base typography.

```css
@import "tailwindcss";

@theme {
  --color-paper: #efe6d6;
  --color-paper-2: #e7dcc7;
  --color-ink: #2a2018;
  --color-ink-2: #5e4c3a;
  --color-rust: #9a5418;
  --color-amber: #c07b2c;
  --color-line: #cdbb9a;
  /* hardness ramp: soft sapwood -> dense heartwood */
  --color-h-0: #e7d8b5;
  --color-h-1: #d8b27a;
  --color-h-2: #b98a4e;
  --color-h-3: #8a4f1c;
  --color-h-4: #5a3717;

  --font-serif: "Fraunces", ui-serif, Georgia, serif;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

html { scroll-behavior: smooth; }
body { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-sans); }

/* editorial helpers reused across the site */
.kicker { font-family: var(--font-mono); font-size: .72rem; letter-spacing: .16em; text-transform: uppercase; }
.baseline { background-image: repeating-linear-gradient(0deg, rgba(120,85,45,.045) 0 1px, transparent 1px 30px); }
```

- [ ] **Step 4: Create `web/app.vue`.**

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

- [ ] **Step 5: Create `web/layouts/default.vue`** — the mono masthead and footer used on every page (GitHub + portfolio links live here).

```vue
<template>
  <div class="min-h-screen flex flex-col">
    <header class="flex items-baseline justify-between px-6 py-3 border-b-[1.5px] border-ink font-mono text-[.66rem] tracking-[.14em] uppercase text-ink-2">
      <NuxtLink to="/" class="font-medium tracking-[.3em] text-ink">Heartwood</NuxtLink>
      <span class="hidden sm:inline">Truth engine for AI agents</span>
      <nav class="flex gap-4">
        <NuxtLink to="/docs" class="hover:text-ink">Docs</NuxtLink>
        <NuxtLink to="/wiki" class="hover:text-ink">Wiki</NuxtLink>
        <a href="/auth/github" class="text-rust hover:text-ink">Sign in</a>
      </nav>
    </header>

    <main class="flex-1"><slot /></main>

    <footer class="px-6 py-8 border-t-[1.5px] border-ink font-mono text-[.66rem] tracking-[.08em] text-ink-2 flex flex-wrap gap-x-8 gap-y-2 justify-between">
      <span>Heartwood · 2026 · Nº 01</span>
      <span class="flex gap-6">
        <a href="https://github.com/WlanKabL/heartwood" class="hover:text-ink">GitHub</a>
        <a href="https://wlankabl.dev" class="hover:text-ink">Portfolio</a>
      </span>
    </footer>
  </div>
</template>
```

Note: confirm the exact portfolio URL with the founder before launch; `https://wlankabl.dev` is the placeholder.

- [ ] **Step 6: Install and boot.**

Run: `cd web && pnpm install`
Then: `pnpm dev`
Expected: Nuxt starts on `http://localhost:3000`; the page renders the masthead and footer with no console errors. (A blank main area is fine until Task 4.)

- [ ] **Step 7: Commit.**

```bash
git add web/package.json web/nuxt.config.ts web/assets web/app.vue web/layouts web/pnpm-lock.yaml
git commit -m "feat: scaffold web/ Nuxt 4 app with field-guide design tokens"
```

---

## Task 4: The landing page

**Files:**
- Create: `web/pages/index.vue`
- Create: `web/components/site/SpecimenDisc.vue`
- Create: `web/components/site/SectionRule.vue`
- Add: `web/public/wood-hero.jpg` (placeholder; see Step 1)

The visual reference is the locked mockup `a-refined.html`: warm paper, a full-height wood photo band, the annotated ring specimen on the seam, a drop-cap deck, a mono chapter index. No centered hero stack, no stat tiles, no gradient glow.

- [ ] **Step 1: Add a placeholder hero image.** Download a free, warm wood/trunk macro into `web/public/wood-hero.jpg`. Free source (Unsplash, no attribution required): pick a vertical trunk/bark image, e.g. from `https://unsplash.com/s/photos/tree-trunk`. Keep it ~1200px wide. If offline, leave the file absent; the component falls back to a CSS wood gradient (Step 3). Record the chosen photo URL in a comment in `index.vue` for later credit.

- [ ] **Step 2: Create `web/components/site/SpecimenDisc.vue`** — the annotated growth-ring disc (the brand object). Props let later pages feed real callouts; here it uses defaults.

```vue
<script setup lang="ts">
interface Callout { label: string; meta: string; angle: number }
withDefaults(defineProps<{ callouts?: Callout[] }>(), {
  callouts: () => [
    { label: 'identity', meta: 'ROOT · 92 · protected', angle: -28 },
    { label: 'voice', meta: '81 · protected', angle: -8 },
    { label: 'audiences', meta: '58', angle: 12 },
    { label: 'qr-handover', meta: 'LEAF · 34', angle: 40 },
  ],
})
const rings = [98, 84, 68, 50, 32, 16]
const pt = (angle: number, r: number) => {
  const a = (angle * Math.PI) / 180
  return { x: 120 + Math.cos(a) * r, y: 120 + Math.sin(a) * r }
}
</script>

<template>
  <svg viewBox="0 0 360 240" class="w-full h-auto" role="img" aria-label="Heartwood growth-ring specimen">
    <defs>
      <radialGradient id="wood" cx="42%" cy="46%" r="60%">
        <stop offset="0%" stop-color="#4a2c12" /><stop offset="34%" stop-color="#7c4f24" />
        <stop offset="68%" stop-color="#b88a4e" /><stop offset="100%" stop-color="#ecdcb8" />
      </radialGradient>
    </defs>
    <circle cx="120" cy="120" r="118" fill="#efe6d6" />
    <circle cx="120" cy="120" r="110" fill="url(#wood)" />
    <g fill="none" stroke="#2c1a0b" stroke-opacity=".32">
      <circle v-for="r in rings" :key="r" cx="120" cy="120" :r="r" :stroke-width="(120 - r) / 30 + 1" />
    </g>
    <circle cx="120" cy="120" r="5" fill="#efe6d6" />
    <g v-for="(c, i) in callouts" :key="i">
      <line :x1="pt(c.angle, 18).x" :y1="pt(c.angle, 18).y" x2="250" :y2="60 + i * 44" stroke="#7a6346" stroke-width="1" />
      <text x="258" :y="57 + i * 44" font-family="JetBrains Mono" font-size="11" fill="#2c2118" font-weight="600">{{ c.label }}</text>
      <text x="258" :y="71 + i * 44" font-family="JetBrains Mono" font-size="9" fill="#9a5418">{{ c.meta }}</text>
    </g>
  </svg>
</template>
```

- [ ] **Step 3: Create `web/pages/index.vue`** — the hero plus the explainer sections. Structure (do not center; keep the asymmetric split and editorial rhythm):
  1. **Hero:** left full-height photo band (`wood-hero.jpg`, `object-cover`, warm multiply overlay, `bg` wood-gradient fallback behind it) with a vertical `specimen Nº 01` label and a `FIG. 1` footnote; right editorial column with chapter no `01 / The problem with forgetful agents`, `<h1>` "Give your agents a <em>spine.</em>" in `font-serif`, a drop-cap deck, a primary CTA `Plant your first tree → /auth/github` and a mono ghost link `read_the_concept`, and a bottom mono index (02 The model / 03 Hardness / 04 Connect / 05 Field notes) anchoring to the sections below. The `SpecimenDisc` overlaps the seam between the two columns.
  2. **02 The model:** roots → trunk → branches → leaves, as an asymmetric editorial passage, not four equal cards. One side carries the prose; the other a labelled depth scale.
  3. **03 Hardness / the iron rule:** "AI proposes, server enforces." Explain hardness = the structural band the server enforces; a prompt can nudge inside it, never break it. Pull-quote treatment.
  4. **04 Connect in two minutes:** a mono copy-paste `.mcp.json` block (the snippet from `docs/usage.md`) and a one-line "then open a new Claude Code chat."
  5. **05 Proof:** dogfooded against KeeperLog and ZentraX; link out.
  6. CTA close: `Plant your first tree`.

Use the design tokens (`text-ink`, `bg-paper`, `text-rust`, `font-serif`, `font-mono`, the `.kicker`/`.baseline` helpers). Section dividers via `SectionRule.vue`. Keep copy in the field-guide voice; no dashes as punctuation.

- [ ] **Step 4: Create `web/components/site/SectionRule.vue`** — a hairline rule with a mono section number, reused between sections.

```vue
<script setup lang="ts">
defineProps<{ n: string; title: string }>()
</script>
<template>
  <div class="flex items-baseline gap-4 border-t-[1.5px] border-ink pt-3 mt-20">
    <span class="font-mono text-rust text-[.7rem]">{{ n }}</span>
    <span class="font-mono uppercase tracking-[.14em] text-[.7rem] text-ink-2">{{ title }}</span>
  </div>
</template>
```

- [ ] **Step 5: Verify in the browser.** With the backend running (`pnpm dev` at repo root) and `cd web && pnpm dev`, open `http://localhost:3000`.
Expected: the landing page renders in the warm field-guide language, the hero photo (or gradient fallback) fills the left band, the specimen disc shows annotated rings, the index anchors scroll to sections, the `Sign in` and `Plant your first tree` links point at `/auth/github`. Check the console for zero errors and that fonts loaded (Fraunces in the headline).

- [ ] **Step 6: Commit.**

```bash
git add web/pages web/components web/public
git commit -m "feat: landing page in the field-guide design language"
```

---

## Self-review (this plan vs the spec)

- Spec "REST read API (`GET /api/trees`, `GET /api/trees/:treeId`, search)" → Tasks 1–2. Write endpoints are deferred to Plan 4 (editor), as the spec's build order allows.
- Spec "Nuxt 4, prerender marketing, SPA app, Tailwind tokens, fonts" → Task 3 (`routeRules`, `@theme`, font links).
- Spec "landing in the field-guide style, GitHub + portfolio links in footer" → Task 4 + the layout footer in Task 3.
- Spec "import core, never edit it; one line in server.ts" → Task 1 Steps 3–4 only import from `core/service.js` and add one registration line.
- Spec "tenant isolation tested" → Task 1 Step 1 (`never shows another user trees`) and Task 2 Step 1 (`empty forest for another user tree`).
- Deferred by design (their own plans, listed below): auth redirect to `/app`, token screen, viewer, editor + write endpoints, docs/wiki, Docker/nginx.

Type consistency: the adapter uses `TreeStore.forUser` → `TreeRepository`, and the service functions `getResolvedTree(repo, treeId, now)`, `listTreeSummaries(repo)`, `searchTruths(repo, treeId, q, now)` exactly as defined in `src/core/service.ts`. `TreeSummary` is `{ treeId, nodeCount }`. The decorated request field is `treeUserId` everywhere.

---

## Subsequent plans (roadmap, written when each is reached)

- **Plan 2 — Auth + app shell + tokens.** Redirect `completeGithubLogin` to `/app` (one line in `auth-routes.ts`); `/app` trees overview (uses `GET /api/trees`, create/delete tree); `/app/tokens` token management against `/api/tokens`; `/app/settings`; a `useSession` composable reading `/api/me`; client-side auth guard on `/app/**`.
- **Plan 3 — Tree viewer.** `/app/trees/:treeId` ring view (d3-hierarchy radial over `GET /api/trees/:treeId`) + outline view + detail panel + search box. TDD the layout math (depth→radius, hardness→ramp) as pure functions.
- **Plan 4 — Editor + write endpoints.** Extend `tree-routes.ts` with `POST/PATCH/DELETE` node routes and `POST .../move` and `DELETE /api/trees/:treeId`, each delegating to `createNode`/`updateNode`/`moveNode`/`deleteNode`/`deleteTree` and passing through the wrapped `{ node, hardnessNote?, volatilityWarning?, similarTo? }` / cascade-preview shapes. Frontend: inline create/edit/move/delete and the cascade-preview modal (preview shown, confirm re-sends with `confirm: true`). TDD the adapter incl. tenant isolation and the protected-confirm path.
- **Plan 5 — Docs + wiki/FAQ.** `/docs` setup guide (the `docs/usage.md` steps as copy-paste blocks) and `/wiki` concept + FAQ, both prerendered.
- **Plan 6 — Docker/nginx.** `web/Dockerfile` (build → nginx serving `.output/public` with `try_files $uri /200.html`), nginx reverse-proxy for `/api` `/auth` `/mcp` `/trees`, a thin backend `Dockerfile`, and the extended `docker-compose.yml` (`db` + `app` + `web`).
