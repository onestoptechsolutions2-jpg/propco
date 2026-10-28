# PropCo admin console

For PropCo staff only. It is where you watch the platform's health, see how every customer company is doing, and help them when something goes wrong. Customers never see it.

Open it from the menu: **PropCo admin, Customers & health** (`/platform`).

## Who can use it

People whose email is listed in the `PLATFORM_ADMIN_EMAILS` environment variable (comma-separated). They also need an ordinary PropCo account. Everyone else gets a plain "not found" page for every admin address, so the console's existence is not advertised. Each action re-checks this on the server; hiding a button is not what protects it.

Add or remove staff by editing the variable and redeploying.

## The overview page

![Admin overview](images/admin-overview.jpg)

**Numbers**
| Card | Meaning |
|---|---|
| Customers | All companies, with sign-ups this week and this month |
| On trial | Free trial still running |
| Paying | Trial over and a paid plan is current |
| Monthly revenue | The listed price of every live paid plan (a company with a live plan counts even during its trial) |
| Lapsed | Paid plan ended and not renewed |
| Units managed | Units and tenants across all companies |

**System health** (green is fine, amber needs a look, red is broken)
| Line | What it tells you |
|---|---|
| Database | Can the app reach Postgres right now |
| Background worker | Last time the worker checked in. Red after 3 minutes of silence: reminders, message sending and payment checks are not running |
| Daily rent job | Last successful run. Amber if more than 26 hours ago |
| Payment checks | Last run of the check that rescues lost payment confirmations |
| Messages | Queued, failed and skipped in the last 24 hours. *Skipped* means no contact details or no provider keys |
| Online payments | Payments stuck pending for over 30 minutes, and failures in 24 hours |

The worker writes these check-ins to the `SystemHeartbeat` table (see [deployment](deployment.md)). If a line is red for a worker you know is running, check that it can reach the database.

**Needs attention** lists, most urgent first: trials ending within 3 days, paid plans ending within 5 days, plans that lapsed in the last 14 days, and **paying customers nobody has signed in for 14 days** (the quiet ones who tend to leave). Each links to the customer.

![Customer list](images/admin-customers.jpg)

**Customer list** is searchable by company name, account number (the 8 characters on their Billing page) or any user's email, and filterable by status (trial, paying, lapsed, free, suspended). Shows plan, usage, last sign-in and join date, 50 per page.

## A customer's page

![A customer's page](images/admin-customer.jpg)

Everything support needs in one place:
- **Snapshot:** properties, units, tenants, active leases; rent paid/late/due over 90 days; messages sent/failed/skipped over 7 days.
- **Plan and billing:** activate a plan for N months, extend the trial by 14 days, **suspend** or reactivate the whole company.
- **Online payments:** whether M-Pesa and card payments are switched on (never the keys), and recent payment attempts with the reason for any failure.
- **People:** every user with role, last sign-in, and state (suspended, locked, wrong-password count, must change password), with support actions below.
- **Message problems:** recent failed and skipped messages and why.
![People, with support actions](images/admin-customer-people.jpg)

- **Internal notes:** your private log for this customer (what they asked, what you said, what to follow up). Customers never see these.
- **Recent activity:** the customer's own activity log, with support actions highlighted.

![Recent activity, including support actions](images/admin-customer-activity.jpg)

## Common support jobs

| Customer says | Do this |
|---|---|
| "I can't sign in, I forgot my password" | *Reset password* on their row. A temporary password appears **once** on screen. Tell it to them securely. They must choose a new one at their next sign-in. There is no self-service "forgot password" yet, so this is the route |
| "It says my account is locked" | *Unlock* (shown when they have wrong-password attempts or a lock). Five wrong passwords lock an account for 15 minutes |
| "A staff member left" | *Suspend* on that person (or they do it under Team) |
| "I paid for my plan but it hasn't switched on" | Check *Online payments* for the attempt. If they paid by M-Pesa to your till, *Activate* the plan for the months paid. Add a note |
| "Tenants aren't getting messages" | Look at *Message problems*. "No provider configured" means the platform has no email/SMS keys; "No phone/email on file" is the customer's data |
| "Online rent payments aren't arriving" | *Online payments* shows failed attempts and reasons. See [payments troubleshooting](payments.md#troubleshooting) |
| Non-payment, abuse, chargeback | *Suspend company* with a reason. Everyone in it is signed out and cannot sign in; their data is kept. *Reactivate* restores access |
| A trial customer needs more time | *Extend trial by 14 days* |

## Safety rules built in

- **Everything is visible to the customer.** Every support action is written to the customer's own activity log as `Support: your.email@...` (Team, Activity), so their admins can see who touched their account and why. This is deliberate: it keeps support honest and builds trust.
- **No impersonation.** There is no "sign in as the customer" button. Support can fix access, plans and settings without seeing or acting as a customer. If you ever need it, add it as a time-limited, customer-approved, fully logged feature, not a back door.
- **No private business data.** The console shows counts and operational state, not tenant names, rent amounts or financial records. It never shows payment keys or password hashes.
- **Temporary passwords** are random, 12 characters with no look-alike letters, shown once, stored hashed, never written to the activity log, and force a change at next sign-in.
- **You can't suspend your own company**, so you cannot lock yourself out.
- **Actions only work through the right company.** Acting on a person through a different company's page is refused.

## Data

| Table | Purpose |
|---|---|
| `Organization.suspendedAt`, `suspendedReason` | Company suspension |
| `SupportNote` | Internal notes |
| `SystemHeartbeat` | Worker and job check-ins |
| `AuditLog` | The existing activity log; support actions are rows with actor `Support: <email>` |

Code: `src/lib/platform.ts` (queries and the admin check), `src/lib/platform-ops.ts` (the support actions), `src/app/(app)/platform/`.

## Testing

```sh
pnpm build
DATABASE_URL=postgresql://propco:propco@localhost:5432/propco?schema=public sh scripts/platform-test/run.sh
```

36 checks against a real database and a real sign-in: the status filters match the app's plan rules, search, every support action and its activity-log entry, customers cannot see the console, suspension locks out people already signed in, temporary passwords, and worker health. It creates its own companies and removes them.

## Not included yet (good next steps)

- A customer-facing "forgot password" email link, which would remove most password-reset support work.
- Emailing or messaging customers from the console (for example to every trial ending soon).
- Revenue over time and churn charts (needs a history of plan changes).
- A support inbox or tickets.
- Per-customer feature flags and usage limits.
