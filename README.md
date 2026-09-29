# PropCo — Property Management Platform

**Phase 1** (done): authentication (Google OAuth + email/password), roles
(Admin / Staff / Owner / Self-Managing Landlord), and full CRUD for
Properties, Units, Owners and Tenants, including a basic lease-assignment
flow.

**Phase 2** (done, except live M-Pesa): manual rent collection — a rent roll (`/rent`)
showing every active lease's payment status for the current month, a
per-lease payment history, and a form to record payments (M-Pesa, bank,
cash, or card) with a reference number. **Not yet wired up:** live M-Pesa
STK Push — recording an M-Pesa payment today is a manual entry (e.g. after
checking your phone/statement), not an automatic charge. Building that
requires your actual Safaricom Daraja API credentials (sandbox or
production) — see "What's next" below.

**Phase 3** (done): owner payouts (`/payouts`). Pick a month and generate one
payout per owner from that month's rent marked *Paid* on their
agency-managed properties, less the per-property commission % (set on each
property's form, default 10%). Regenerating recalculates anything still
pending and never touches a payout already marked paid. Owners see a
read-only view of their own payouts.

**Background worker** (`scripts/worker.ts`, the `worker` service): every day
at 00:05 (and once on boot) it creates a Pending rent row for each active
lease that has none this month, and flips overdue Pending rows to Late.

**Phase 4** (done): maintenance & suppliers. `/suppliers` — a directory of
contractors by trade (plumber, electrician, carpenter, painter, general).
`/maintenance` — log a request against a unit, assign it to a supplier with
a cost estimate, track it through in-progress to done with an actual cost.
Owners get a read-only view scoped to their own properties; staff/landlords
can log, assign, and close requests. Maintenance costs (DONE jobs completed in the month) are deducted from owner
payouts, and `/supplier-payments` lets staff mark completed jobs as paid to
the supplier (manual entry; no live M-Pesa B2C).

**Phase 5** (done, delivery needs provider keys): notifications. Events — payment
received (owner), payout sent (owner), rent late (tenant), lease expiring in
60 days (owner + tenant), maintenance assigned (supplier), maintenance done
(owner + tenant), supplier paid — are queued in a `Notification` table and
delivered by the worker every minute via each recipient's preferred channel
(set on their edit page). Email uses Resend and SMS uses Africa's Talking
(see `.env.example`); WhatsApp isn't wired up. With no keys, messages show as
*Skipped* on `/notifications`.

**Usability pass:** the app is an installable PWA (manifest, service worker,
"Install app" banner; Android/desktop Chrome and iOS "Add to Home Screen"),
with 90-day sessions so it stays signed in. The menu is grouped in plain
language (Money in / Money out / Repairs / Messages). `/guide` has
step-by-step wizards per role, with steps ticked automatically from real
data. WhatsApp messages are sent from the staff member's own device: they
appear under `/notifications` with a "Send on WhatsApp" button (wa.me link),
and the menu shows a count of those waiting. Icons are SVG; add PNG icons
if you need older-iOS home-screen icons.

**SaaS / multi-company:** every record belongs to an `Organization`; users only
see their own company's data. Public landing + pricing (`/`), self-serve
signup with a 14-day trial (`/signup`), free tier of 5 units, paid plans
(Growth/Pro/Scale, edit prices in `src/lib/plans.ts`), `/billing` for
customers, `/team` to add staff, and `/platform` (emails in
`PLATFORM_ADMIN_EMAILS`) where you see all companies, MRR, and activate a plan
after you receive their M-Pesa payment. Existing data is moved into one
unlimited company by migration `20260107000000_multi_tenancy`.

**Owner statements:** each payout row has a *Statement* link: a print-ready
breakdown (rent received per unit, commission, repairs, net) with a
"Print / Save as PDF" button. Owners see their own; no PDF library needed.

**Utilities, move-in and move-out** (paid plans / trial): `/utilities` -
meters per unit (water, electricity, gas, internet), metered or flat-fee,
bulk "record readings" for a property, automatic tenant bills with a
message, unpaid-bill list with WhatsApp reminders. `/leases` - a move-in
checklist (tasks plus unit condition), and a move-out checklist that reuses
the move-in inventory, prices damage, adds unpaid utilities and rent, settles
the deposit, ends the lease, frees the unit (or opens a repair request), and
prints a clearance certificate. New leases open straight into onboarding.

**M-Pesa is manual by design (proof of payment):** tenants pay the agency's
till/paybill and forward the confirmation SMS. Staff paste it into
`/rent/confirm`; the code, amount and payer are read automatically, matched to a
tenant by phone, and become a Paid rent payment on approval. A code can never be
used twice. Subscription customers do the same on `/billing`; you activate their
plan from `/platform`. No Daraja credentials are needed.

**Receipts and invoices:** every paid rent row has a printable *Receipt*; each
lease has an *Invoice / statement* of unpaid rent and utility bills with the
company's "how to pay" text (set under My team > Company details). Both can be
printed/saved as PDF or sent on WhatsApp.

Later phases (payroll, payroll,
documents, reporting, analytics) build on this foundation without changing
what's here.


## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4
- Auth.js (NextAuth v5) — Google OAuth + credentials, JWT sessions
- Prisma + PostgreSQL
- Containerized: Docker Compose with `app`, `db` (Postgres), and `worker`
  (runs `scripts/worker.ts` — daily rent generation/late-flagging, more
  scheduled jobs land here in later phases)

## 1. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `AUTH_SECRET` — optional when running via the provided Docker setup; the
  container generates and persists one automatically on first boot if you
  leave it unset (see `docker-entrypoint.sh`). Set it explicitly if you
  want to control it yourself, or if you're running `pnpm dev` locally
  without Docker (generate with `openssl rand -base64 32`).
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

This starts Postgres, the Next.js app (as a standalone server, not
Vercel's runtime), and the `worker` — which runs `scripts/worker.ts` to
generate each month's rent rows and flag late ones daily. All three start
by default with a plain `docker compose up`.

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

Migrations and seeding now run automatically — every time the `app`
container boots, `docker-entrypoint.sh` runs `prisma migrate deploy`
(applies any migrations not already recorded as run — safe to repeat) and
then `prisma/seed.ts` (upserts the admin/owner, and skips the sample
property if it already exists — also safe to repeat). Nothing to run by
hand.

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

- **Live M-Pesa STK Push**: needs your Safaricom Daraja API consumer
  key/secret and shortcode (sandbox or production). Once you have those,
  the natural next step is a `/api/mpesa/stk-push` route that initiates a
  push to the tenant's phone, plus a webhook route
  (`/api/mpesa/callback`) that Safaricom calls back with the result —
  which would then create/update a `Payment` row automatically instead of
  a staff member entering it by hand.
- After that: invoicing, payroll, documents & contracts, reporting, and
  analytics — see `property-management-platform-spec.md` for the full
  module list and build-phase order.

## Known limitation in this sandbox

Prisma's query-engine binaries download from `binaries.prisma.sh`, which
isn't reachable from the environment this was built in — so `prisma
generate` / `migrate` and a live `pnpm dev` boot haven't been verified
end-to-end yet. The schema and code follow Prisma 6.3.1's documented API;
run `pnpm install && pnpm prisma generate && pnpm dev` (or the Docker steps
above) in an environment with normal internet access as the first check,
and report back anything that doesn't come up clean.
