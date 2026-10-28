# PropCo developer guide

For people who build, run and extend PropCo.

> **Read this first.** PropCo uses a recent Next.js (16) with breaking changes from older versions. Before writing framework code, read the relevant page in `node_modules/next/dist/docs/` (see `AGENTS.md`). Do not rely on memory of older Next.js APIs.

| Guide | Read it to |
|---|---|
| [Getting started](getting-started.md) | Run PropCo on your machine, load demo data, use the scripts |
| [Architecture](architecture.md) | Understand the moving parts and how a request flows |
| [Data model](data-model.md) | Find your way around the 38 database models |
| [Authentication and permissions](auth-and-permissions.md) | Protect pages and actions correctly; keep companies separate |
| [Background jobs](background-jobs.md) | Work on the worker, notifications, retries and heartbeats |
| [Online payments](../payments.md) | Work on M-Pesa and Flutterwave |
| [Testing](testing.md) | Run and write the end-to-end suites |
| [Contributing](contributing.md) | Conventions, checklists and recipes for common changes |
| [Deployment and operations](../deployment.md) | Environment variables, migrations, backups, health |
| [Admin console](../admin-console.md) | PropCo's internal support and monitoring tools |

Product and user documentation: [product overview](../product/README.md), [user guide](../user-guide/README.md).

## The stack

| Layer | Choice |
|---|---|
| Web framework | Next.js 16 (App Router, server components, server actions), React 19 |
| Language | TypeScript |
| Database | PostgreSQL 16 through Prisma 6 |
| Sign-in | Auth.js (next-auth 5 beta): email and password, optional Google |
| Validation | Zod |
| Styling | Tailwind CSS 4 |
| Scheduling | node-cron in a separate worker process |
| Packaging | Docker (one image runs both the app and the worker) |
| Hosting | Coolify on a VPS (any Docker host works) |

There is no separate API server and no client-side data layer: pages are server components that read the database directly, and changes go through server actions.

## Principles the code follows

1. **Every record belongs to a company, and every query says so.** Cross-company leaks are the worst bug this product can have, so they are tested for explicitly.
2. **Check permissions, never role names.** `requirePermission("rent.manage")`, not "is staff".
3. **Money is exact.** Amounts are `Decimal` in the database; never floating point arithmetic on stored money.
4. **Side effects are idempotent.** Jobs and payment completions can run twice, or on two servers, and must still do the right thing once.
5. **Never trust a webhook.** Confirm with the provider before recording money.
6. **Keep it boring.** No extra services (queues, caches, search) until there is a measured need. Polling the database is fine at this size.
7. **Tell the user.** Every sensitive change writes an audit entry; support actions are visible to the customer.
8. **Document in the same change.** A feature is not done until its guide in `docs/` is updated.
