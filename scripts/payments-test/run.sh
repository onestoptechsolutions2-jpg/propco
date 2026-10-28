#!/bin/sh
# Runs the online-payments end-to-end test: mock gateway + the built app + the test script.
# Needs: Postgres reachable at DATABASE_URL with migrations applied, and `pnpm build` done.
#   DATABASE_URL=postgresql://propco:propco@localhost:5432/propco?schema=public sh scripts/payments-test/run.sh
set -e
cd "$(dirname "$0")/../.."

export MOCK_PORT=4010 APP_PORT=3058
export MPESA_BASE_URL="http://localhost:$MOCK_PORT" FLUTTERWAVE_BASE_URL="http://localhost:$MOCK_PORT"
export PAYMENTS_ENCRYPTION_KEY="test-encryption-key" AUTH_SECRET="test" AUTH_TRUST_HOST=true
export APP_URL="http://localhost:$APP_PORT" APP_URL_TEST="http://localhost:$APP_PORT"
export PLATFORM_CALLBACK_TOKEN="platform-token-for-tests" PLATFORM_FLW_SECRET_KEY="FLWSECK_TEST" PLATFORM_FLW_WEBHOOK_HASH="platform-hash"

node scripts/payments-test/mock-gateway.mjs & MOCK_PID=$!
npx next start -p "$APP_PORT" >/dev/null 2>&1 & APP_PID=$!
trap 'kill $MOCK_PID $APP_PID 2>/dev/null || true' EXIT
sleep 8
npx tsx scripts/payments-test/run.ts
