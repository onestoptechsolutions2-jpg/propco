# Testing

PropCo's confidence comes from **end-to-end suites that run against a real database and a real built app**, plus type-checking and linting. There is no mocking of the database: the bugs that matter here (company separation, money applied once) only show up against real Postgres.

## Always

```sh
npx tsc --noEmit    # types
npx eslint          # lint (the repo is kept at zero warnings)
pnpm build          # production build, which also type-checks
```

## The suites

All three need a throwaway Postgres in `DATABASE_URL` with migrations applied, and a built app (`pnpm build`). Never point them at production: they create and delete test companies.

| Suite | Command | Checks | Proves |
|---|---|---|---|
| **Payments** | `sh scripts/payments-test/run.sh` | 26 | M-Pesa and Flutterwave flows against a mock gateway: encryption at rest, happy path, replayed and forged callbacks, cross-company tokens, parallel callbacks, lost callback recovery, expiry, declined cards, currency, plan activation and underpayment |
| **Admin console** | `sh scripts/platform-test/run.sh` | 36 | Status filters match the plan rules, search, every support action and its audit entry, non-staff get 404, suspension cuts off signed-in users, temporary passwords, worker health |
| **Isolation** | see `scripts/isolation-test/README.md` | many | Company A cannot read or change company B's data: read paths, write paths, and a before/after database diff |

Each script starts what it needs (a mock gateway, the app on its own port), runs a TypeScript test with `tsx`, prints `PASS`/`FAIL` per check and `ALL CHECKS PASSED`, then **stops everything it started**. They find their own processes by an environment marker (`PROPCO_TEST_RUN`), so they never touch anyone else's servers.

Typical run:

```sh
export DATABASE_URL="postgresql://propco:propco@localhost:5432/propco_test?schema=public"
pnpm prisma migrate deploy
pnpm build
sh scripts/payments-test/run.sh
sh scripts/platform-test/run.sh
```

## Writing a test in the same style

Look at `scripts/platform-test/run.ts`. The shape:

1. Create your own fixtures (companies, users, records) with a unique tag, never reusing seeded data.
2. Call the code under test directly (library functions) for logic, and the running app over HTTP for behaviour that depends on sign-in, redirects or status codes. `login()` there signs in through the real Auth.js credentials endpoint and returns a cookie.
3. Use `check(name, ok, extra)` for every assertion so a failure names itself.
4. **Always clean up in `finally`**, deleting by the ids you created.
5. Exit non-zero on any failure.

Test the negative paths as hard as the positive ones: wrong company, wrong permission, replay, concurrency (`Promise.all` of the same request), signed-out, suspended.

## The mock gateway

`scripts/payments-test/mock-gateway.mjs` stands in for Safaricom and Flutterwave. The app is pointed at it with `MPESA_BASE_URL` and `FLUTTERWAVE_BASE_URL` (test-only variables; never set them in production). Tests control outcomes through `POST /__set`. It cannot prove the providers' real behaviour: **run one real sandbox payment with each provider before going live.**

## What is not covered yet

- Browser-level tests (clicks and layout). The screenshot script drives a real browser through most screens and would fail loudly if a page broke, but it is not an assertion suite.
- Load tests.
- Real provider sandboxes (needs credentials).

## Before you open a pull request

- [ ] `npx tsc --noEmit` and `npx eslint` clean; `pnpm build` passes
- [ ] The relevant end-to-end suite passes; extended if you added behaviour
- [ ] Isolation test run and extended if you touched data access or added a record type
- [ ] Docs updated; screenshots re-taken if a screen changed
- [ ] The pull request says what was **not** tested
