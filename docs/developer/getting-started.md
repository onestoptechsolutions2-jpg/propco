# Getting started

## Prerequisites

- Node.js 22 and pnpm (`corepack enable` provides pnpm)
- PostgreSQL (version 16 is what production runs)
- Optional: Docker, for the all-in-one setup

## Quick start with Docker

```sh
cp .env.example .env
docker compose up --build
```

This starts Postgres, the app, the worker and the nightly backup. Open <http://localhost:3010> and sign in with the seeded admin: `admin@propco.local` / `changeme123`. Change that password in any real deployment.

On start, the app container applies migrations and runs the (idempotent) seed. Nothing to run by hand.

## Run locally without Docker

```sh
cp .env.example .env        # set DATABASE_URL to your Postgres
pnpm install                # also runs `prisma generate`
pnpm prisma migrate deploy  # apply migrations (use `pnpm db:migrate` while developing a new one)
pnpm db:seed                # admin user and a sample property
pnpm dev                    # http://localhost:3000
```

Run the worker in a second terminal when you need reminders, message sending or payment reconciliation:

```sh
npx tsx scripts/worker.ts
```

## Environment

`.env.example` lists every variable with a comment; [deployment](../deployment.md) explains them. For local work you need `DATABASE_URL` and (without Docker) `AUTH_SECRET`. Everything else is optional: without email/SMS keys messages are recorded as *Skipped*; without payment keys the online-payment buttons stay hidden.

To open the PropCo admin console locally, set `PLATFORM_ADMIN_EMAILS` to your sign-in email.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Production build (also type-checks) |
| `pnpm lint` | ESLint (`npx eslint` is equivalent) |
| `npx tsc --noEmit` | Type-check only |
| `pnpm db:migrate` | Create and apply a migration from schema changes |
| `pnpm db:studio` | Browse the database |
| `pnpm db:seed` | Seed the admin user and a sample property |
| `npx tsx scripts/worker.ts` | Run the background worker |

## Test suites

| Command | What it proves |
|---|---|
| `sh scripts/payments-test/run.sh` | Online payments against a mock Safaricom/Flutterwave |
| `sh scripts/platform-test/run.sh` | The admin console and support tools |
| see `scripts/isolation-test/README.md` | One company can never read or change another's data |

All need a built app (`pnpm build`) and a throwaway Postgres in `DATABASE_URL`. Details: [testing](testing.md).

## Demo data and screenshots

`scripts/docs/` builds a realistic demo company (Mwangaza Property Managers) and takes the screenshots used in the manuals from the real app.

```sh
pnpm build
sh scripts/docs/screenshots.sh   # resets the propco_docs database, seeds it, takes ~50 screenshots into docs/images
```

It needs Playwright with Chromium (`pnpm dlx playwright install chromium`) and a Postgres user that can create a database (override with `PG_URL`). Re-run it whenever a screen changes, then commit the new images. The demo seed (`scripts/docs/seed-demo.ts`) refuses to run on a database that already has data, and **must never be run in production** (it creates users with a published password).

To explore the demo yourself, point `DATABASE_URL` at `propco_docs` and sign in as `wanjiru@mwangaza.example` / `DemoPass#2026`. The PropCo admin console demo user is `support@propco.example` (set `PLATFORM_ADMIN_EMAILS` to it).

## Troubleshooting

| Problem | Fix |
|---|---|
| `prisma generate` errors on install | Make sure OpenSSL is installed and `prisma/schema.prisma` exists before install |
| `next start` warns about `output: standalone` | Harmless locally. In Docker the app runs with `node server.js` |
| Sign-in redirects forever | Set `AUTH_SECRET` and `AUTH_URL` (or `AUTH_TRUST_HOST=true` behind a proxy) |
| Payment webhooks never arrive locally | Providers cannot reach `localhost`. Use a tunnel, or test with the mock gateway |
| A test leaves a server running | Its script stops what it started; if you killed it midway, stop stray `next-server` processes by hand |
