# Heartwood Deployment Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Ship Heartwood to a server the KeeperLog way: prebuilt GHCR images, a production docker-compose with Postgres + backend + frontend, a GitHub-Actions build-and-deploy with health-check + rollback. NO proxy in the compose — a host nginx (hand-wired in sites-available) plus certbot terminates TLS and routes the domain, exactly like KeeperLog. Heartwood's containers only expose ports (different from KeeperLog's 3300/3301).

**Architecture:** Host nginx → `/` to the Nuxt frontend container (`3320:3000`), `/api` + `/mcp` + `/auth` + `/trees` to the Fastify backend container (`3321:8722`). One domain, so same-origin, no CORS. Postgres on an internal-only network; backend on internal + web; frontend on web only. Drizzle migrations run from the backend entrypoint before the server starts.

**Tech Stack:** Node 22 alpine, pnpm, multi-stage Docker, Drizzle migrator, GHCR, GitHub Actions, SSH deploy.

**Ports (chosen to avoid KeeperLog's 3300/3301):** frontend `3320:3000`, backend `3321:8722`. Postgres not published (internal network only).

**GHCR images:** `ghcr.io/wlankabl/heartwood/backend`, `ghcr.io/wlankabl/heartwood/frontend`.

**What the USER does (not buildable here) — list in the deploy doc:**
- Register a SECOND GitHub OAuth app for prod (callback `https://<domain>/auth/github/callback`).
- Create the GitHub `production` environment secrets (DEPLOY_HOST/USER/SSH_KEY/PATH, GHCR_USER/TOKEN, the full prod DOTENV).
- Prepare the server (a self-hosted runner OR a runner with SSH access, the deploy dir, the data dir).
- Hand-write the nginx site (the doc gives a ready server block) and run certbot.

---

## Task 1: Backend deploy-prep — health endpoint, migrate script, workspace, dockerignore

**Files:** `src/http/health.ts` (or add to server.ts), `src/scripts/migrate.ts`, `pnpm-workspace.yaml`, `.dockerignore`, test.

- [ ] **Step 1: Health endpoint.** Add an UNAUTHENTICATED `GET /health` route in the Fastify app (`src/http/server.ts` or a small `registerHealth`) returning `{ status: 'ok' }` with 200. It must NOT be behind session/token auth (the container healthcheck and the deploy script curl it). Add a test asserting `GET /health` → 200 `{status:'ok'}` without any auth.
- [ ] **Step 2: Migrate script.** `src/scripts/migrate.ts`: read `DATABASE_URL` from env, `createDb`, run `migrate(db, { migrationsFolder: './migrations' })` (the same `drizzle-orm/node-postgres/migrator` the test setup uses), log applied count, close the pool, exit 0 on success / non-zero on failure. Add a `db:migrate:deploy` script to root `package.json` → `tsx src/scripts/migrate.ts` (this is what the entrypoint runs in prod; production-safe, applies pending only, never generates).
- [ ] **Step 3: Workspace + dockerignore.** Add `pnpm-workspace.yaml` declaring `web` as a package (so the frontend build resolves cleanly in Docker). Add a root `.dockerignore` (node_modules, .git, web/.nuxt, web/.output, web/node_modules, *.db, .env, dist).
- [ ] **Step 4:** Run `pnpm test` + `pnpm typecheck` green. Run the migrate script against the dev DB to prove it applies cleanly (`$env:DATABASE_URL='postgres://heartwood:heartwood@localhost:5432/heartwood'; pnpm db:migrate:deploy`). Commit `feat: health endpoint, deploy migrate script, workspace + dockerignore`.

## Task 2: Dockerfiles + entrypoint

**Files:** `docker/backend.Dockerfile`, `docker/frontend.Dockerfile`, `docker/entrypoint.sh`.

- [ ] **Step 1: Backend Dockerfile** (multi-stage, mirror KeeperLog `apps/backend/Dockerfile`): build stage on `node:22-alpine` with pnpm, install deps, compile TS (`pnpm build` → tsc to `dist/`). Production stage: copy `dist/`, `migrations/`, `package.json`, the migrate script's runtime needs (`tsx` if the entrypoint runs the .ts migrate, OR compile the migrate script too and run the .js), node_modules. Non-root user. `ENTRYPOINT ["/app/docker/entrypoint.sh"]`. Expose `8722`.
- [ ] **Step 2: Entrypoint** (`docker/entrypoint.sh`): run the migrate (`node dist/scripts/migrate.js` or `pnpm db:migrate:deploy`), and on success `exec node dist/main.js`. If migrate fails, exit non-zero (never start the server against an unmigrated DB). Keep it small and POSIX-sh.
- [ ] **Step 3: Frontend Dockerfile** (multi-stage, mirror KeeperLog `apps/frontend/Dockerfile`): build stage runs `pnpm -C web install && pnpm -C web build` (`nuxt build` → `web/.output`). Production stage copies only `web/.output`, non-root user, `CMD ["node", ".output/server/index.mjs"]`, expose `3000`. Build args only if the frontend bakes any URL (keep minimal — same-origin means relative URLs, so likely just a SITE_URL/PUBLIC_URL if used).
- [ ] **Step 4: Verify locally.** `docker build -f docker/backend.Dockerfile -t heartwood-backend:test .` and `docker build -f docker/frontend.Dockerfile -t heartwood-frontend:test .` both succeed. Commit `feat: backend + frontend Dockerfiles + migrate entrypoint`.

## Task 3: Production docker-compose

**Files:** `docker-compose.production.yml`.

- [ ] **Step 1:** Services:
  - `postgres` (postgres:16): `internal` network only, NOT published, volume `${DATA_DIR:-./data}/postgres`, healthcheck `pg_isready`, restart unless-stopped, env `POSTGRES_USER/PASSWORD/DB` from `.env`.
  - `backend`: image `${BACKEND_IMAGE}:${DEPLOY_TAG}`, networks `internal` + `web`, ports `3321:8722`, `depends_on` postgres healthy, env from `.env` (`DATABASE_URL` pointing at the `postgres` service host, `SESSION_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `PUBLIC_URL`, `PORT=8722`), healthcheck `curl -sf http://localhost:8722/health`, restart unless-stopped.
  - `frontend`: image `${FRONTEND_IMAGE}:${DEPLOY_TAG}`, network `web` only, ports `3320:3000`, `depends_on` backend, healthcheck `curl -sf http://localhost:3000/`, restart unless-stopped.
  - Networks `internal` (postgres↔backend) and `web` (backend↔frontend↔host-proxy). NO nginx service.
- [ ] **Step 2: Verify.** `docker compose -f docker-compose.production.yml config` validates with a sample `.env`. Commit `feat: production docker-compose (postgres + backend + frontend, host-proxy)`.

## Task 4: CI/CD — build-push + SSH deploy with rollback

**Files:** `.github/workflows/deploy.yml`, `.github/scripts/deploy.sh`.

- [ ] **Step 1: Workflow** (`deploy.yml`, adapt KeeperLog): `workflow_dispatch` with inputs `ref`, `image_tag` (optional), `environment: production`. Job `build-and-push`: checkout, set up Docker, `docker login ghcr.io` with `GHCR_USER`/`GHCR_TOKEN`, build + push both images tagged with the commit SHA and `latest`. Job `deploy` (needs build-and-push): run `.github/scripts/deploy.sh` with the production-environment secrets.
- [ ] **Step 2: deploy.sh** (adapt KeeperLog `.github/scripts/deploy.sh`): `setup_ssh` (key from secret), `pre_check` (capture current image tags for rollback), `transfer_files` (copy `docker-compose.production.yml` → `docker-compose.yml` on the server, write `.env` from the `DOTENV` secret, append `BACKEND_IMAGE`/`FRONTEND_IMAGE`/`DEPLOY_TAG`), `deploy_services` (`docker login`, `docker compose pull`, `up -d postgres`, wait, `up -d`, the backend entrypoint runs the Drizzle migrate, then a healthcheck loop curling `http://localhost:3321/health` and `http://localhost:3320/`), `rollback_services` on failure. Keep the structure and the rollback path faithful to KeeperLog, just: Drizzle not Prisma (migration is in the entrypoint, so no separate prisma step), ports 3321/3320, image names heartwood/backend + /frontend.
- [ ] **Step 3: Verify.** `shellcheck .github/scripts/deploy.sh` (if available) or a careful `bash -n` syntax check; confirm the workflow YAML parses. Commit `feat: github-actions build-push + ssh deploy with rollback`.

## Task 5: Deployment docs

**Files:** `docs/deployment.md`.

- [ ] **Step 1:** Write the operator guide:
  - **Prod GitHub OAuth app:** register a second app, callback `https://<domain>/auth/github/callback`, put its id/secret in the prod `.env`.
  - **GitHub secrets** (environment `production`): the full list (DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_PATH, GHCR_USER, GHCR_TOKEN, DOTENV) with one line each on what it is.
  - **Prod `.env` template:** DATABASE_URL (the in-compose postgres), POSTGRES_PASSWORD, SESSION_SECRET (32+ real), GITHUB_CLIENT_ID/SECRET (prod app), PUBLIC_URL (`https://<domain>`), DEPLOY_TAG/BACKEND_IMAGE/FRONTEND_IMAGE.
  - **Server prep:** create the deploy dir + `./data` dir, install Docker, set up the runner / SSH access.
  - **The nginx site (hand-wired):** a ready-to-paste `server` block for sites-available that proxies `location /` → `127.0.0.1:3320`, and `location ~ ^/(api|mcp|auth|trees)` → `127.0.0.1:3321`, with the websocket/SSE upgrade headers for `/mcp` (StreamableHTTP), then `certbot --nginx -d <domain>`.
  - **Deploy:** trigger the GitHub Action; what success looks like; how rollback behaves.
- [ ] **Step 2:** Commit `docs: deployment guide (secrets, nginx site, prod oauth, deploy flow)`.

---

## Out of scope
- Postgres backups, monitoring/log aggregation, multi-host scaling — later.
- Automatic TLS in-compose (Caddy) — the user wires nginx + certbot by hand on the host.

## Verification reality
Files are built and locally verifiable (image builds, `compose config`, the health endpoint test, the migrate script against the dev DB, shell/yaml syntax). The live deploy depends on the user's server, secrets, prod OAuth app, and nginx site — those steps are documented for the user, not executed here.
