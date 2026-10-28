#!/bin/sh
# End-to-end test of the PropCo agents, commissions and owner money against a built app.
# Needs Postgres at DATABASE_URL with migrations applied and `pnpm build` done.
#   DATABASE_URL=postgresql://propco:propco@localhost:5432/propco?schema=public sh scripts/agents-test/run.sh
set -e
cd "$(dirname "$0")/../.."

# Stop everything this run started. `next start` detaches its server, so we find our processes by a
# marker in their environment instead of by parent or process group (and never touch anyone else's).
export PROPCO_TEST_RUN="$$-$(date +%s)"
stop_ours() {
  for p in /proc/[0-9]*; do
    grep -qa "PROPCO_TEST_RUN=$PROPCO_TEST_RUN" "$p/environ" 2>/dev/null && kill "${p#/proc/}" 2>/dev/null
  done
  true
}
trap stop_ours EXIT
export APP_PORT=3061 AUTH_SECRET="test" AUTH_TRUST_HOST=true
export APP_URL="http://localhost:$APP_PORT" AUTH_URL="http://localhost:$APP_PORT" APP_URL_TEST="http://localhost:$APP_PORT"
export AGENTS_TEST=1
./node_modules/.bin/next start -p "$APP_PORT" >/dev/null 2>&1 & APP_PID=$!
sleep 8
npx tsx scripts/agents-test/run.ts
