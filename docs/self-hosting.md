# Self-hosting Heartwood

Heartwood is a small, self-contained stack: a Fastify backend, a Nuxt frontend, and a Postgres
database. You can run your own instance for your own trees. This guide is for running it yourself,
end to end. For the automated CI/CD deploy used by the reference instance, see
[deployment.md](deployment.md); to connect an agent once it runs, see [usage.md](usage.md).

## 1. What you need

- A machine with Docker and the Compose plugin (the simplest path), or Node 22 + pnpm 10 and a
  reachable Postgres if you prefer running from source.
- A domain or host name you can point at the machine, and a way to terminate TLS (a reverse proxy
  such as nginx + certbot, or any TLS-terminating proxy). Heartwood itself speaks plain HTTP; the
  proxy adds HTTPS.
- A GitHub OAuth app (login is GitHub-only today). See section 3.

## 2. Configuration (every option)

All backend configuration is environment variables, validated on startup, so the server refuses
to boot if anything required is missing or malformed (`src/config.ts`).

| Var | Required | Default | What it is |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Postgres connection string, e.g. `postgres://heartwood:secret@postgres:5432/heartwood` |
| `GITHUB_CLIENT_ID` | yes | — | Client id of your GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | yes | — | Client secret of your GitHub OAuth app |
| `SESSION_SECRET` | yes | — | Cookie session key, **at least 32 characters**. Keep it stable; rotating it logs everyone out |
| `PUBLIC_URL` | yes | — | The publicly reachable base URL of the backend, e.g. `https://heartwood.example.com`. The OAuth callback is built from this, so it must match exactly |
| `PORT` | no | `8722` | HTTP port the backend listens on |

The Compose stack adds three more for the Postgres container and the data volume:

| Var | What it is |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credentials and name for the bundled Postgres |
| `DATA_DIR` | Host path for persistent data (defaults to `./data`) |

Generate a strong session secret with `openssl rand -base64 48`.

## 3. Register a GitHub OAuth app

Go to <https://github.com/settings/developers> and create a **New OAuth App**:

| Field | Value |
| --- | --- |
| Homepage URL | your `PUBLIC_URL` |
| Authorization callback URL | `${PUBLIC_URL}/auth/github/callback` |

Copy the **Client ID** and a generated **Client Secret** into `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`. The callback must match `PUBLIC_URL` exactly, scheme included, or every
login fails.

## 4. Run it with Docker Compose

The repo ships `docker-compose.production.yml` (postgres on an internal-only network, backend on
host port 3321, frontend on host port 3320) and the two `docker/*.Dockerfile` images.

1. Clone the repo and write a `.env` next to the compose file with the variables from section 2.
   The backend talks to Postgres by the compose service name, so use `@postgres:5432` in
   `DATABASE_URL`, not `localhost`.

   > Native-module note: `@fastify/secure-session` pulls in `sodium-native`, which needs glibc.
   > The backend image is `node:22-slim` for that reason. Do not switch it to alpine.

2. Build the images locally (you do not need the published GHCR images):

   ```bash
   docker build -f docker/backend.Dockerfile -t heartwood-backend .
   docker build -f docker/frontend.Dockerfile -t heartwood-frontend .
   ```

   Then set `BACKEND_IMAGE=heartwood-backend` and `FRONTEND_IMAGE=heartwood-frontend` in your
   `.env` (the compose file reads the image names from there).

3. Start Postgres, then the app:

   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```

   The backend entrypoint runs the Drizzle migrations before the server starts, so the schema is
   created on first boot and is never re-applied once present.

4. Put your TLS-terminating reverse proxy in front. The backend (`/api`, `/auth`, `/mcp`,
   `/trees`) is on `127.0.0.1:3321`, the frontend on `127.0.0.1:3320`. The `/mcp` location must
   not buffer (`proxy_buffering off`, `proxy_http_version 1.1`, `proxy_set_header Connection ''`)
   or long-lived MCP streams get cut. A ready-to-use nginx block is in
   [deployment.md](deployment.md) section 6.

## 5. Run it from source (without Docker)

If you would rather not use Docker for the app itself:

```bash
pnpm install
pnpm --filter heartwood... build      # builds backend; see package.json scripts
pnpm db:migrate:deploy                  # apply migrations to your Postgres
pnpm start                              # starts the backend on PORT
pnpm -C web build && node web/.output/server/index.mjs   # the frontend (Nitro node server)
```

You still need a reachable Postgres and the same environment variables. This path is more work to
keep running than Compose; Compose is the recommended way.

## 6. Updating

Pull the latest code, rebuild the images (or your source build), and bring the stack back up.
Migrations are idempotent and run on container start, so an update never double-applies them. There
is no destructive reset step; your trees survive updates.
