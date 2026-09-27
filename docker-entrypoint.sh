#!/bin/sh
# Auto-generates AUTH_SECRET on first boot if it isn't already set via
# environment variable, and persists it to a file under /app/data (a
# mounted volume — see docker-compose.yml) so it survives container
# restarts and redeploys. Regenerating it on every boot would silently
# invalidate every signed-in session each time the container restarts.
#
# An explicit AUTH_SECRET env var (e.g. set in Coolify's UI) always wins
# and is never overwritten.
set -e

SECRET_FILE="/app/data/auth_secret"

if [ -z "$AUTH_SECRET" ]; then
  mkdir -p /app/data
  if [ -f "$SECRET_FILE" ]; then
    AUTH_SECRET="$(cat "$SECRET_FILE")"
  else
    AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
    echo "$AUTH_SECRET" > "$SECRET_FILE"
    echo "Generated a new AUTH_SECRET and saved it to $SECRET_FILE"
  fi
  export AUTH_SECRET
fi

# Apply pending migrations and seed on every boot of the main app process
# (identified by the default CMD, "node server.js" — the worker service
# overrides the command entirely and skips this). `prisma migrate deploy`
# only applies migrations not already recorded as run, so this is safe to
# repeat on every deploy/restart. `seed.ts` is written to be idempotent
# (upserts, and skips sample data it already created) for the same reason.
if [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy

  echo "Seeding database..."
  npx tsx prisma/seed.ts
fi

exec "$@"
