# Deployment and operations

## Services (docker-compose.yml)

| Service | What it does |
|---|---|
| `db` | Postgres 16, data in the `propco_db_data` volume |
| `app` | The Next.js app. On every start it runs `prisma migrate deploy` and the idempotent seed, so migrations apply by themselves |
| `worker` | `scripts/worker.ts`: daily rent generation and reminders, delivers queued messages every minute, checks unfinished online payments every 2 minutes |
| `backup` | Writes a compressed `pg_dump` every 24 hours to the `propco_backups` volume, keeps 14 days |

On Coolify, the platform's own proxy provides HTTPS; the app is published on host port 3010.

## Environment variables

Copy `.env.example` to `.env`; it lists every variable with a comment. Summary:

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Always (already set in `docker-compose.yml`) |
| `AUTH_SECRET` | Sessions. Generated and kept in a volume if empty |
| `APP_URL` | The public address; used to build payment webhook URLs. If empty, falls back to `AUTH_URL`, then the request's host |
| `PLATFORM_ADMIN_EMAILS` | Who may open the [PropCo admin console](admin-console.md) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM` | Email messages |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | SMS (Africa's Talking) |
| `PAYMENTS_ENCRYPTION_KEY` | Encrypting companies' saved payment keys. Set it before anyone saves keys, then never change it |
| `PLATFORM_*` | PropCo's own M-Pesa / Flutterwave account for plan payments (see [payments](payments.md)) |
| `BILLING_MPESA_TILL`, `BILLING_WHATSAPP` | Manual billing instructions |

The worker and the app need the same `DATABASE_URL`, `AUTH_SECRET`, `PAYMENTS_ENCRYPTION_KEY` and `PLATFORM_*` values (`docker-compose.yml` loads `.env` into both).

## Migrations

Applied automatically on app start. To run by hand: `pnpm prisma migrate deploy`. Never edit a migration that has been applied; add a new one.

## Health

`GET /api/health` returns `{"status":"ok"}` (200) when the app can reach the database, and 503 otherwise. The `app` container health check calls it, and it is safe to point an uptime monitor at it. It is public and reveals nothing else.

## Backups and restore

The `backup` service keeps `propco-YYYY-MM-DD.sql.gz` files for 14 days in the `propco_backups` volume. An empty or failed dump is thrown away so the last good file is never replaced by a bad one. Check it is working: `docker logs <backup container>` should say `backup ok`.

Restore into an empty database:

```sh
gunzip -c propco-2026-10-28.sql.gz | psql -h db -U propco propco
```

Test a restore once before you need one. The volume lives on the same server as the database, so also copy the files elsewhere (another server or object storage) to survive losing the server.

## The worker

- **Daily (00:05 and at start):** creates each active lease's rent row for the month, flags late rent, sends rent reminders, lease-expiry and subscription-expiry notices. A database lock means two workers never do this twice; every step is safe to repeat.
- **Every minute:** sends queued email/SMS. A failed send is retried after 1, 2, 4 and 8 minutes and only then marked FAILED. WhatsApp messages stay queued for a person to tap *Send on WhatsApp*.
- **Every 2 minutes:** asks M-Pesa/Flutterwave about unfinished online payments and completes or expires them.

The worker also records a check-in every minute (and after each daily run and payment check) in `SystemHeartbeat`; the admin console shows it as health. If the worker is down, the app keeps working; reminders and lost-callback recovery wait until it is back.

## Moving to a bigger setup later

The app is stateless apart from the database, so running several `app` containers behind the proxy works. Run **one** worker (the locks make a second one harmless, not useful). Live updates poll the database every 4 seconds per open tab; if you reach many hundreds of simultaneous users, replace that poll with Postgres `LISTEN/NOTIFY`.
