#!/bin/sh
set -e

echo "[entrypoint] running database migrations..."
if ! node /app/dist/scripts/migrate.js; then
  echo "[entrypoint] migration failed — refusing to start server" >&2
  exit 1
fi

echo "[entrypoint] migrations applied — starting server..."
exec node /app/dist/main.js
