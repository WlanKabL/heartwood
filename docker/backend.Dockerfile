# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# Copy manifests first so pnpm install is cached when source changes
COPY package.json pnpm-lock.yaml ./

# Use hoisted layout to avoid symlink issues inside Docker
RUN echo "node-linker=hoisted" > .npmrc

# Install all deps (including devDependencies — we need tsc + type declarations to build)
RUN pnpm install --frozen-lockfile

# Copy source + config
COPY src/ ./src/
COPY tsconfig.json tsconfig.build.json drizzle.config.ts ./

# Build TypeScript, excluding test files
RUN pnpm exec tsc -p tsconfig.build.json

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy migrations so migrationsFolder: './migrations' resolves at /app/migrations
COPY migrations/ ./migrations/

# Copy manifest and install production deps only
COPY package.json pnpm-lock.yaml ./
RUN echo "node-linker=hoisted" > .npmrc
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate \
  && pnpm install --frozen-lockfile --prod \
  && corepack disable

# Copy entrypoint
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S heartwood -u 1001 -G nodejs
RUN chown -R heartwood:nodejs /app
USER heartwood

EXPOSE 8722

ENTRYPOINT ["/app/docker/entrypoint.sh"]
