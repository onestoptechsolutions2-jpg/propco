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

exec "$@"
