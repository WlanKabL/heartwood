# Deploying Heartwood to Production

## 1. Overview

Heartwood ships as two pre-built OCI images (`ghcr.io/wlankabl/heartwood/backend` and
`ghcr.io/wlankabl/heartwood/frontend`) pulled from GHCR on every deploy. The production
compose stack (`docker-compose.production.yml`) runs postgres on an internal-only network, the
backend on host port 3321, and the frontend on host port 3320. A host-level nginx (managed by you,
not by compose) terminates TLS via certbot and reverse-proxies both ports under a single domain,
so every browser session is same-origin.

---

## 2. Register a production GitHub OAuth app

The dev OAuth app points at `localhost`. Production needs a separate one.

Go to <https://github.com/settings/developers> and click **New OAuth App**. Fill it in:

| Field | Value |
| --- | --- |
| Application name | `Heartwood (production)` (or any label you like) |
| Homepage URL | `https://<your-domain>` |
| Authorization callback URL | `https://<your-domain>/auth/github/callback` |

The callback URL is built from `PUBLIC_URL` at runtime. It must match `PUBLIC_URL` exactly,
including the scheme — a trailing slash or wrong scheme causes every login attempt to fail.

Copy the generated **Client ID** and generate a **Client Secret**. Both go into the prod `.env`
as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

---

## 3. GitHub `production` environment: variables and secrets

In your repository go to **Settings > Environments** and create an environment named `production`.
GitHub keeps **Variables** (not sensitive, stored in clear, readable) separate from **Secrets**
(sensitive, masked in logs). Put each value in its right bucket so the secret store holds only
things that are actually secret.

**Variables** — _Settings > Environments > production > Add variable_:

| Variable | What to put in |
| --- | --- |
| `DEPLOY_HOST` | IP address or hostname of the server |
| `DEPLOY_USER` | SSH user the action logs in as (e.g. `deploy`) |
| `DEPLOY_PATH` | Absolute path on the server where Heartwood lives, e.g. `/opt/heartwood` |
| `GHCR_USER` | Your GitHub username or the org that owns the packages (used for the server-side pull) |

**Secrets** — _Settings > Environments > production > Add secret_:

| Secret | What to put in |
| --- | --- |
| `DEPLOY_SSH_KEY` | The **private** key (multiline PEM, including `-----BEGIN`/`-----END`) |
| `GHCR_TOKEN` | A GitHub PAT with `read:packages` — only the **server pull** needs it; the image build+push uses the built-in `GITHUB_TOKEN` |
| `DOTENV` | The **full content** of the prod `.env` file (see the template below) |

> The build-and-push job logs in to GHCR with GitHub's built-in `GITHUB_TOKEN` (covered by the
> workflow's `packages: write` permission), so you do **not** need a PAT for pushing. `GHCR_TOKEN`
> only needs `read:packages`, for the server to pull the images.

The deploy script appends `BACKEND_IMAGE`, `FRONTEND_IMAGE`, and `DEPLOY_TAG` to the remote
`.env` automatically. Do not include those in `DOTENV`.

---

## 4. Prod `.env` template

Generate a strong session secret before filling this in:

```bash
openssl rand -base64 48
```

Then populate every variable:

```dotenv
# ── Postgres ──────────────────────────────────────────────
POSTGRES_USER=heartwood
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=heartwood

# ── Backend ───────────────────────────────────────────────
# Host is the compose service name "postgres", not localhost.
DATABASE_URL=postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>

SESSION_SECRET=<output of openssl rand -base64 48>

GITHUB_CLIENT_ID=<from the production OAuth app>
GITHUB_CLIENT_SECRET=<from the production OAuth app>

PUBLIC_URL=https://<your-domain>
PORT=8722

# ── Persistent data ───────────────────────────────────────
DATA_DIR=./data
```

The deploy script appends the following block after writing your env. Do not add them manually:

```dotenv
# ── Deploy-injected (managed by CI/CD — do not edit) ──
BACKEND_IMAGE=ghcr.io/wlankabl/heartwood/backend
FRONTEND_IMAGE=ghcr.io/wlankabl/heartwood/frontend
DEPLOY_TAG=<sha or tag resolved at build time>
```

---

## 5. Server prep

On the target server (run these once):

```bash
# Install Docker and the compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker <DEPLOY_USER>
# Re-login so the group membership takes effect.

# Create the deploy directory and the data directory
sudo mkdir -p /opt/heartwood/data
sudo chown -R <DEPLOY_USER>:<DEPLOY_USER> /opt/heartwood
```

The GitHub Action runs on a GitHub-hosted runner (`ubuntu-latest`) and SSHes into your server
to place files and run compose commands. The server only needs to accept SSH connections from
GitHub's runner IP ranges; no outbound access from the runner to GitHub is required beyond that.

To avoid egress and speed up builds, replace `runs-on: ubuntu-latest` in
`.github/workflows/deploy.yml` with `runs-on: self-hosted` and register a self-hosted runner on
the same machine or a build box. The rest of the workflow is unchanged.

---

## 6. nginx site (hand-wired)

Compose does not manage nginx. Create the site config on the server, then let certbot add TLS.

Create `/etc/nginx/sites-available/heartwood`:

```nginx
server {
    listen 80;
    server_name <your-domain>;

    # MCP is a Streamable HTTP / SSE endpoint — streaming must not be buffered.
    location ~ ^/(api|mcp|auth|trees)(/|$) {
        proxy_pass         http://127.0.0.1:3321;
        proxy_http_version 1.1;
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }

    # Everything else goes to the Nuxt SSR frontend.
    location / {
        proxy_pass         http://127.0.0.1:3320;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }
}
```

Enable it, test, reload, and issue a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/heartwood /etc/nginx/sites-enabled/heartwood
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d <your-domain>
```

Certbot rewrites the `listen 80` block to also handle port 443 with the issued certificate.

> The `/mcp` location uses `proxy_http_version 1.1` and `proxy_set_header Connection ''` so nginx
> does not downgrade to HTTP/1.0 and does not add a `Connection: close` header. Without these two
> lines long-lived SSE streams are cut off after the first flush. `proxy_buffering off` ensures
> each server-sent event is forwarded immediately rather than held in nginx's output buffer.

---

## 7. Deploy

### Trigger

Go to **Actions > Deploy > Run workflow**. Two inputs:

| Input | What it does |
| --- | --- |
| `ref` | Branch or tag to build from (default `main`) |
| `image_tag` | Leave empty to build a fresh image from `ref`. Pass a previous tag (e.g. `sha-abc1234`) to skip the build and redeploy that image directly. |

### What happens

When `image_tag` is empty the `build-and-push` job runs first: it checks out `ref`, logs in to
GHCR with the built-in `GITHUB_TOKEN`, builds both Dockerfiles, and pushes them tagged with the
short commit SHA and `latest`. (The server-side pull later uses `GHCR_USER` / `GHCR_TOKEN`.)

The `deploy` job always runs (whether or not a build happened). It SSHes into the server and:

1. Captures the currently running image tags into `.deploy-state` (rollback snapshot).
2. Transfers `docker-compose.production.yml` to the server as `docker-compose.yml`.
3. Writes the `.env` (your `DOTENV` secret, then appends the injected image vars).
4. Starts postgres, waits for it to become healthy.
5. Starts backend and frontend. The backend entrypoint runs Drizzle migrations before the
   server process starts, so the schema is always up to date.
6. Polls `http://localhost:3321/health` for `{"status":"ok"}` and `http://localhost:3320/`
   for HTTP 200, up to 12 attempts over ~2 minutes.

### Success

Both healthchecks pass, the action logs `Deployment verified — all services healthy`, and
compose prunes dangling images.

### Automatic rollback

If the healthcheck loop exhausts its retries the script checks `.deploy-state`. If a previous
version was running it restores the backed-up `docker-compose.yml.rollback` and `.env.rollback`,
pulls the previous images, and brings the stack back up. The action exits non-zero either way, so
the GitHub run shows as failed regardless of whether rollback succeeded.

### Redeploy a known-good tag

Set `image_tag` to the short SHA you want (e.g. `sha-abc1234`). The `build-and-push` job is
skipped entirely; the `deploy` job goes straight to SSH with that tag.

---

## 8. First-run note

On the very first deploy `.deploy-state` does not exist and there are no running containers.
The pre-check step records `ROLLBACK_POSSIBLE=false`. If the first deploy fails, the automatic
rollback is skipped (there is nothing to roll back to) and the action prints a message asking
for manual intervention.

Drizzle migrations run from the backend entrypoint on every container start. They are
idempotent: already-applied migrations are skipped, so a restart or redeploy never re-runs them.
