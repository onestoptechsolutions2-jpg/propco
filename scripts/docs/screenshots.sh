#!/bin/sh
# Rebuilds the screenshots for the manuals from a fresh demo database.
#   pnpm build && sh scripts/docs/screenshots.sh
# Needs Postgres reachable as the user in PG_URL (default below) that may create a database.
set -e
cd "$(dirname "$0")/../.."

PG_URL="${PG_URL:-postgresql://propco:propco@localhost:5432}"
DB="propco_docs"
export DATABASE_URL="$PG_URL/$DB?schema=public"
export PAYMENTS_ENCRYPTION_KEY="docs-demo-key" AUTH_SECRET="docs-demo-secret" AUTH_TRUST_HOST=true
export DOCS_PORT=3080 APP_URL="http://localhost:3080" AUTH_URL="http://localhost:3080"
export PLATFORM_ADMIN_EMAILS="support@propco.example"

export PROPCO_TEST_RUN="docs-$$-$(date +%s)"
stop_ours() {
  for p in /proc/[0-9]*; do
    grep -qa "PROPCO_TEST_RUN=$PROPCO_TEST_RUN" "$p/environ" 2>/dev/null && kill "${p#/proc/}" 2>/dev/null
  done
  true
}
trap stop_ours EXIT

# Fresh demo database (drops and recreates $DB)
psql "$PG_URL/postgres" -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
npx prisma migrate deploy >/dev/null
npx tsx scripts/docs/seed-demo.ts

./node_modules/.bin/next start -p "$DOCS_PORT" >/dev/null 2>&1 &
sleep 8
node scripts/docs/screenshots.mjs
