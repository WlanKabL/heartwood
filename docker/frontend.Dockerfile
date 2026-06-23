# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# Copy the self-contained web package (has its own package.json + pnpm-lock.yaml)
COPY web/ ./web/

# Install dependencies inside web/ using its own lockfile
RUN pnpm -C web install --frozen-lockfile

# Build Nuxt app (output → web/.output)
RUN pnpm -C web build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Nuxt .output is fully self-contained — no extra node_modules needed at runtime
COPY --from=builder /app/web/.output ./.output

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S heartwood -u 1001 -G nodejs
RUN chown -R heartwood:nodejs /app
USER heartwood

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
