# Heartwood web

The Nuxt 4 frontend: marketing landing, GitHub login, API-token management, and the tree
viewer/editor. It talks same-origin to the Fastify backend.

## Run (development)

From the repo root, one command starts the backend and this app together:

```bash
docker compose up -d db   # Postgres, once
pnpm dev                  # backend on :8722, web on :3000
```

Open <http://localhost:3000>. The Nuxt dev server proxies `/api`, `/auth`, `/mcp` and `/trees`
to the backend, so everything is one origin and the session cookie just works.

### How auth is wired

`http://localhost:8722` is the backend only (MCP, `/auth`, `/api`, `/trees`). Users never hit
it directly. The **web origin is the single front door**: in dev that is this Nuxt server on
`http://localhost:3000`, which proxies `/auth`, `/api`, `/mcp` and `/trees` to the backend. In
production nginx plays that role.

The session cookie is bound to the origin the browser is on, so the whole OAuth flow has to run
on the web origin. That is why `PUBLIC_URL` is `http://localhost:3000` (already set in
`.env.example`), and the dev port is pinned to 3000 (`strictPort`, so it fails loudly rather
than drifting to 3001).

The one manual step is your GitHub OAuth app (<https://github.com/settings/developers>):

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/auth/github/callback`

In production, set `PUBLIC_URL` to your public domain and register that domain's callback.

## Build

```bash
pnpm generate   # static output for nginx (Plan 6)
pnpm build      # full build (node server output)
```
