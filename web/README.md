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

### Logging in during development

The browser session cookie is set on whichever origin you browse, so for GitHub login to work
through the dev proxy, the backend's `PUBLIC_URL` and your GitHub OAuth app must point at the
**web** origin, not the backend port:

1. In the repo-root `.env`, set `PUBLIC_URL=http://localhost:3000`.
2. In your GitHub OAuth app (<https://github.com/settings/developers>), set
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/github/callback`
3. Make sure port 3000 is free so Nuxt does not fall back to 3001 (which would break the match).

In production the same rule applies: `PUBLIC_URL` is the public front door (the nginx origin),
and nginx proxies `/auth` and `/api` to the backend.

## Build

```bash
pnpm generate   # static output for nginx (Plan 6)
pnpm build      # full build (node server output)
```
