# Features guide (quick reference)

A short summary of the newer features. For step-by-step instructions with screenshots, use the [user guide](user-guide/README.md); for what the product is and who it is for, see the [product overview](product/README.md).

## Chat (home screen after login)

Type what happened; PropCo works out what you mean and asks you to tap **Confirm**. Nothing is saved until you tap. It uses simple keyword matching, not AI, so wording matters a little: if it does not understand, it shows examples.

| Say | What happens |
|---|---|
| `John paid rent 25000 mpesa` | Marks that tenant's unpaid rent as paid (or records a payment), with the M-Pesa code if you include it |
| `Leak in unit 4B kitchen` | Logs a repair for the unit |
| `Paid 3500 plumber` | Adds an expense to Books |
| `Add tenant Jane Wanjiru 0712345678` | Adds a tenant |
| `Move Jane into 4B rent 15000 deposit 15000` | Creates the lease and marks the unit occupied |
| `Invoice from Joe 4500 unit 4B` | Adds a supplier invoice for approval |
| `Who owes rent?` | Lists unpaid tenants with a WhatsApp reminder button each |
| `How are we doing this month?` | Money in, out and profit |

Each action checks the same permissions as the normal screens (`rent.manage`, `maintenance.manage`, `books.manage`, `tenants.manage`, `invoices.manage`). Property owners (read-only) do not get Chat.

## Books

A cash book that mixes what PropCo already knows (paid rent, paid supplier invoices, paid payroll, paid owner payouts) with entries you type (`paid 3500 airtime`, `received 25k deposit`). Shows money in, out and profit for the month, where the money went, and a CSV download for your accountant. Needs the `books.manage` permission (admins have it; give it to an accountant through *Team and roles*).

## Insights

- Occupancy, rent collected this month, overdue rent, repair spend
- **Unpaid rent by age** (not yet overdue, 1 to 30, 31 to 60, over 60 days)
- **Empty units are costing you**: monthly rent lost to vacancy
- **Leases ending in 90 days**
- **Property by property**: occupancy, collected, collection rate, repairs
- **Money in and out** (with `books.manage`)
- **Rental income tax estimate** (Kenya MRI, 7.5% of rent collected this year). An estimate only: rates and rules change, the tax is the owner's own, and it should be confirmed with KRA or an accountant. The rate and band are one constant in `src/lib/analytics.ts`.

## Live updates

Open pages refresh themselves when something changes in your company: a payment arrives, a message is queued, a repair is logged. It waits while the tab is hidden or you are typing. Technically a server-sent-events stream (`/api/live`) carries only a "something changed" signal; the page then re-reads its data through its normal permission checks.

## Notifications

Email and SMS go through the outbox with automatic retries (see [deployment](deployment.md)); WhatsApp uses a tap-to-send link from your own phone. Without provider keys messages are recorded as SKIPPED so you can see what would have been sent.

## Permissions at a glance

| Permission | Allows |
|---|---|
| `rent.manage` | Collect rent, confirm M-Pesa, request online payments |
| `books.manage` | Books and the money charts in Insights (not given to staff by default) |
| `team.manage` | Team and roles, **Online payments** settings |
| `billing.manage` | Plan and billing, paying for a plan online |

Admins can build custom roles from these under *Team and roles*.
