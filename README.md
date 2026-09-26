# PropCo — Property Management Platform (Phase 1)

Phase 1 of the full spec: authentication (Google OAuth + email/password), roles
(Admin / Staff / Owner / Self-Managing Landlord), and full CRUD for
Properties, Units, Owners and Tenants, including a basic lease-assignment
flow. Later phases (rent collection, payouts, maintenance/suppliers,
invoicing, payroll, documents, reporting, analytics) build on this
foundation without changing what's here.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4
- Auth.js (NextAuth v5) — Google OAuth + credentials, JWT sessions
- Prisma + PostgreSQL
- Containerized: Docker Compose with `app`, `db` (Postgres), `worker`
  (placeholder for Phase 2+ background jobs), and `nginx` as reverse proxy

## 1. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from the
  Google Cloud Console (console.cloud.google.com/apis/credentials).
  Set the authorized redirect URI to `<your-app-url>/api/auth/callback/google`
  (e.g. `http://localhost:3000/api/auth/callback/google` for local dev).
- `DATABASE_URL` — already set correctly for docker-compose; change it if
  you're running Postgres yourself.

## 2. Run with Docker (recommended — matches the containerized hosting target)

```bash
docker compose up --build
```

This starts Postgres and the Next.js app (as a standalone server, not
Vercel's runtime). The `worker` service is defined but idle until Phase 2
background jobs (rent reminders, payment webhooks, payroll runs) are built
— start it with `docker compose --profile with-worker up`.

**On Coolify:** don't add a reverse proxy service to this compose file —
Coolify already runs its own (Traefik) with automatic TLS for whatever
domain you assign in its UI, and it routes to the `app` service on its
published port (`3010` on the host, mapping to `3000` in the container).
An earlier version of this file included an `nginx` service, which
conflicted with that and failed to deploy (`nginx.conf` bind-mount
error) — it's been removed. Adjust the host-side `3010` in
`docker-compose.yml` if that port is already taken on your server.

**Self-hosting without Coolify** (plain `docker compose` on your own VPS):
you'll want a reverse proxy in front of `app` for TLS. A reference
`nginx.conf` is included in this repo; add an `nginx` service back to
`docker-compose.yml` pointing at it if you go this route, or use your own
Caddy/Traefik setup.

Once containers are up, run migrations and seed data against the running
`db` container:

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx tsx prisma/seed.ts
```

Visit `http://localhost:3010` and sign in with the seeded admin account:
**admin@propco.local / changeme123** — change this password immediately
in a real deployment (the seed script is for local/dev use only).

## 3. Or run locally without Docker

Requires Node 22+, pnpm, and a local Postgres instance.

```bash
pnpm install
# point DATABASE_URL at your local Postgres in .env
pnpm prisma migrate dev --name init
pnpm db:seed
pnpm dev
```

## Roles

| Role | What they can do |
|---|---|
| `ADMIN` | Everything |
| `STAFF` | Manage all properties, owners, tenants, leases (agency-managed model) |
| `LANDLORD` | Same write access as Staff, but scoped only to their own Owner record's properties (self-managed model) |
| `OWNER` | Read-only view of their own properties and units |

New users default to `STAFF` in the schema. To make someone an Owner or
Landlord, create their `Owner` record first, then link a `User` to it via
`Owner.user` and set the matching `role` — there's no self-serve signup
flow yet; that's a Phase 2+ decision (see the "Open Questions" section of
the platform spec doc).

## What's next

See `property-management-platform-spec.md` (the original planning doc) for
the full module list and build-phase order: rent collection (M-Pesa/bank/
card), owner payouts, supplier & maintenance management, invoicing,
payroll, documents & contracts, reporting, and analytics.

## Known limitation in this sandbox

Prisma's query-engine binaries download from `binaries.prisma.sh`, which
isn't reachable from the environment this was built in — so `prisma
generate` / `migrate` and a live `pnpm dev` boot haven't been verified
end-to-end yet. The schema and code follow Prisma 6.3.1's documented API;
run `pnpm install && pnpm prisma generate && pnpm dev` (or the Docker steps
above) in an environment with normal internet access as the first check,
and report back anything that doesn't come up clean.
