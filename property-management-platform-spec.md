# PropCo — Full-Stack Property Management Platform

**Scope:** Single agency, managing properties (units or whole buildings) on behalf of owners — end-to-end: leasing, rent collection, owner payouts, maintenance/suppliers, invoicing, payroll, and notifications.

---

## 1. Roles

| Role | Access |
|---|---|
| **Admin** | Full control — everything below |
| **Staff/Agent** | Day-to-day ops for agency-managed properties: leasing, rent logging, maintenance, supplier assignment. No payroll/financial settings. |
| **Owner** (agency-managed) | Read-only portal: their properties, rent collected, payouts, maintenance status, statements, documents |
| **Self-Managing Landlord** | Full operational control of their **own** portfolio only — same capabilities as Staff/Agent, scoped to their properties (see below) |
| **Supplier** *(v2, optional)* | Portal to view assigned jobs, submit invoices, see payment status |

Tenants are **not** app users in v1 — staff or the self-managing landlord manages their records. (Optional tenant SMS/WhatsApp self-service for rent reminders and maintenance requests, without a full login.)

### Two management modes, one system

Every `Property` has a **management mode**: `agency_managed` or `self_managed`. This is set per property, not per account — the same agency instance can host both, and in principle a landlord could have some properties agency-managed and others self-managed.

| | Agency-managed | Self-managed |
|---|---|---|
| Who operates it day-to-day | Staff/Agent | The landlord themself |
| Owner's access | Read-only (view statements, approve big spend if configured) | Full read/write — the landlord *is* the operator |
| Rent collection, maintenance, supplier assignment | Done by staff | Done by the landlord directly |
| Commission | Agency commission % applies, deducted in payout calc | No agency commission — optionally a flat **platform/subscription fee** instead, since the agency is providing software, not management labor |
| Payroll relevance | Agent may earn commission tied to this property | N/A — no agent involved |
| Notifications, invoicing, documents, reporting, analytics | Same features, same UI | Same features, same UI — just operated by the landlord instead of staff |

This keeps the data model, notification service, invoicing, reporting, and analytics **identical** for both modes — only who has write access, and how commission/fees are calculated, changes. A landlord switching from self-managed to agency-managed (or the agency onboarding a new self-managed landlord as a pure software customer) is just a permissions/mode change on their properties, not a different system.

---

## 2. Tech Stack

- **Framework:** Next.js (App Router, TypeScript) — single codebase for staff dashboard, owner portal, and APIs
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js (email/password + optional magic link), role-based middleware
- **File storage:** S3-compatible (lease PDFs, receipts, maintenance photos, invoices)
- **Background jobs:** a queue (e.g. BullMQ + Redis, or a cron-based serverless job runner) for: rent due reminders, late-rent detection, payroll runs, payment webhook processing
- **Payments:**
  - M-Pesa — Safaricom Daraja API (STK Push for rent, B2C for owner/supplier payouts)
  - Bank transfer — manual reconciliation screen (staff mark as received/paid + reference number)
  - Card — Stripe or Flutterwave (for owners/tenants who prefer card)
- **Notifications:** Twilio or Africa's Talking (SMS + WhatsApp Business API) + Resend/SendGrid (email) — unified notification service with per-event channel selection
- **Hosting:** Self-hosted, containerized — Docker Compose (or Kubernetes later) with separate containers for:
  - `app` — Next.js (built as a standalone Node server via `output: 'standalone'`, not the Vercel edge runtime)
  - `db` — PostgreSQL (official `postgres` image, persistent volume for data)
  - `redis` — for the background job queue (BullMQ)
  - `worker` — a separate container running the same codebase in job-worker mode (rent reminders, payroll runs, payment webhook processing), decoupled from the web container so long-running jobs don't block requests
  - `nginx` (or Caddy) — reverse proxy + TLS termination in front of `app`
  - Backups: scheduled `pg_dump` to object storage (S3-compatible/MinIO if fully self-hosted) rather than relying on a managed DB provider's snapshotting
  - File storage: MinIO (self-hosted S3-compatible) if avoiding external cloud storage, or an external S3 bucket if that's acceptable

---

## 3. Data Model (core entities)

**Property & People**
- `Owner` — profile, payout method(s), bank/M-Pesa details, `is_self_managing` flag (grants them staff-level write access, scoped to their own properties, via the same role-based middleware)
- `Property` — address, type (single-unit/building), owner_id, `management_mode` (`agency_managed` | `self_managed`), `platform_fee` (flat fee used only when self-managed, in place of commission)
- `Unit` — belongs to Property, rent amount, status
- `Tenant` — profile, linked unit, lease dates
- `Lease` — unit_id, tenant_id, start/end, rent, deposit, status

**Money**
- `Payment` (rent in) — unit_id, tenant_id, amount, method (mpesa/bank/card), due_date, paid_date, status
- `Payout` (owner out) — owner_id, period, gross rent, commission deducted, maintenance deducted, net amount, method, status
- `Invoice` — polymorphic: to owner (statement) or from supplier (job bill); line items, tax, status (draft/sent/paid/overdue)
- `Commission` — agency's cut per property (flat % or fixed), applied when generating owner payouts

**Maintenance & Suppliers**
- `Supplier` — name, trade (plumber/electrician/carpenter/etc.), contact, rate, payout method
- `MaintenanceRequest` — unit_id, description, photos, status (open/assigned/in-progress/done), reported_by
- `WorkOrder` — links MaintenanceRequest → Supplier, cost estimate, actual cost, completion date
- `SupplierInvoice` — work_order_id, amount, status (pending/approved/paid)

**Staff & Payroll**
- `StaffMember` — profile, role, salary, bank/M-Pesa details
- `PayrollRun` — period, staff list, gross, deductions (tax/NSSF/NHIF/SHIF), net, status
- `Payslip` — per staff, per run

**Documents & Contracts**
- `Document` — polymorphic: attaches to Owner, Tenant, Supplier, Property, or Lease; type (management agreement/lease/supplier contract/ID/title deed/insurance/other), file, version, uploaded_by
- `DocumentVersion` — history of a document when re-uploaded/amended, keeps prior versions
- `Contract` — a structured subset of Document specifically for management agreements & supplier contracts: party, start/end date, renewal terms, commission/rate terms, status (draft/active/expiring/expired/terminated), signature status
- `Signature` *(optional, if e-signing is wanted)* — contract_id, signer, method (uploaded signed PDF vs e-signature provider), signed_at

**Reporting**
- `SavedReport` — name, type (financial/occupancy/maintenance/owner statement/custom), filters, owner (who saved it), schedule (on-demand/weekly/monthly)
- `ReportRun` — a generated instance of a SavedReport — snapshot data + generated PDF/CSV, timestamped (so historical reports don't change if underlying data is edited later)

**System**
- `Notification` — recipient, channel (sms/whatsapp/email), event type, status
- `AuditLog` — who did what, when (critical for financial actions)

---

## 4. Core Modules

### A. Property & Leasing
Add properties → auto-create unit(s) → assign owner → lease to tenant → track lease expiry with renewal alerts.

### B. Rent Collection
- M-Pesa STK Push sent to tenant on due date; webhook confirms payment automatically
- Bank/cash payments logged manually by staff
- Auto-flag late payments; auto-send reminder (SMS/WhatsApp/email, owner's choice of tone/frequency)
- Rent roll dashboard: collected vs outstanding, by property/unit

### C. Owner Payouts & Statements
- Monthly payout run: rent collected − agency commission − maintenance costs charged to owner = net payout
- Payout via M-Pesa B2C, bank transfer, or marked for manual bank processing
- Auto-generated owner statement (PDF) each cycle, emailed + available in portal

### D. Maintenance & Supplier Management
- Tenant/staff logs a maintenance request with photos
- Staff assigns to a supplier (plumber, carpenter, electrician, etc.) from a supplier directory filtered by trade
- Supplier gets notified (SMS/WhatsApp) with job details
- Supplier submits cost/invoice on completion (photo/receipt upload) → staff approves → feeds into supplier payment run
- Cost auto-linked to the property/owner for statement deduction

### E. Invoicing
- Owner invoices/statements (rent summary, deductions, net payout) — auto-generated monthly
- Supplier invoices — submitted or staff-entered, approval workflow before payment
- All invoices support VAT/tax line items (Kenya VAT where applicable), PDF export

### F. Payroll
- Staff salary structure (basic + allowances), statutory deductions (PAYE, NSSF, SHIF)
- Monthly payroll run generates payslips, pays via M-Pesa/bank
- Commission-based pay possible for agents (tied to properties they manage)

### G. Supplier Payments
- Approved supplier invoices batched into a payment run (M-Pesa B2C or bank)
- Payment history per supplier for performance/reliability tracking

### H. Notifications (cross-cutting service)
Central service triggered by events, respecting per-recipient channel preference (SMS/WhatsApp/email):
- Rent due / rent late (tenant)
- Payment received (owner)
- Payout sent (owner)
- Maintenance assigned (supplier) / maintenance resolved (tenant, owner)
- Invoice approved/paid (supplier)
- Payslip issued (staff)
- Lease expiring soon (owner, staff)

### I. Document & Contract Management
- Central document store, attached to the relevant record (owner, tenant, property, supplier) — leases, management agreements, supplier contracts, ID copies, title deeds, insurance certs, etc.
- **Management agreements** (agency ↔ owner) and **supplier contracts** tracked as structured `Contract` records, not just files: start/end date, renewal/notice terms, commission or rate terms, status
- Expiry alerts — notify staff (and owner, where relevant) ahead of a management agreement, lease, or supplier contract expiring, feeding the same notification service as rent/maintenance
- Version history — re-uploading an amended contract keeps prior versions rather than overwriting
- Signature tracking — either upload a signed/scanned copy, or integrate an e-signature provider (e.g. DocuSign/SignRequest API) if fully digital signing is wanted (flagged as a v2 decision below)
- Access control: owners see only their own documents (agreement, statements, lease copies for their units); suppliers see only their own contract; staff/admin see all

### J. Reporting
Two layers:
1. **Standard reports** (pre-built, filterable by date range/property/owner): rent roll, arrears/aging, occupancy & vacancy, income vs expense per property, maintenance cost by property/supplier, payroll summary, commission earned
2. **Saved/scheduled reports** — staff or owners can save a filtered report and have it auto-generated on a schedule (weekly/monthly) and emailed, or pulled on demand from the dashboard
- All reports exportable as PDF and CSV/Excel
- Owner-facing reports are scoped automatically to their own properties (same access rule as the rest of the owner portal)
- `ReportRun` snapshots mean a report generated for March still shows March's numbers even if a payment record is corrected in April — important for financial reports specifically

### L. Analytics
Distinct from Reporting: Reporting produces static, exportable documents for a point in time; Analytics is interactive, trend-based, and lives on-screen for exploring data rather than exporting it.
- **Portfolio-level KPIs:** occupancy rate over time, rent collection rate (collected vs billed, trending monthly), average days-to-fill a vacancy, tenant turnover rate
- **Financial trends:** income vs expenses per property/owner over time, commission earned over time, maintenance spend trend (by property, by trade/supplier)
- **Supplier performance:** average job turnaround time, cost variance (estimate vs actual), job volume per supplier — helps decide who to keep using
- **Staff/agent performance:** properties managed, rent collection rate for their portfolio, maintenance resolution time
- **Owner-facing analytics:** a simplified version scoped to their own properties — occupancy trend, income trend, maintenance spend — as interactive charts on their dashboard (not just the static statement PDF)
- Built as dashboard widgets (charts + KPI cards) with date-range and property/owner filters, backed by aggregate SQL queries (or materialized views once data volume grows) rather than recomputing from raw rows on every page load

### M. Dashboards
- **Staff:** occupancy, rent collection %, overdue maintenance, upcoming lease expiries, pending approvals (invoices/payroll)
- **Owner:** their properties only — occupancy, income vs expenses, maintenance history, downloadable statements

---

## 5. Build Phases

1. **Foundation** — auth, roles, Property/Unit/Owner/Tenant CRUD, basic dashboard
2. **Rent core** — manual + M-Pesa rent logging, late detection, rent roll
3. **Owner portal + payouts** — statements, commission calc, payout runs
4. **Maintenance + suppliers** — request → work order → supplier invoice flow
5. **Notifications** — unified SMS/WhatsApp/email service wired into events above
6. **Invoicing** — formal PDF invoices/statements for owners and suppliers
7. **Payroll** — staff payroll runs, payslips
8. **Document & contract management** — document store, management agreements & supplier contracts as structured records, expiry alerts, version history
9. **Reporting** — standard report set first (rent roll, arrears, occupancy, income/expense), then saved/scheduled reports and CSV/PDF export
10. **Analytics** — KPI dashboard widgets (occupancy, collection rate, financial trends) once enough historical data exists to make trends meaningful; owner-facing simplified version follows
11. **Polish** — audit logs, e-signature integration if wanted, card payments (Stripe/Flutterwave) as an option alongside M-Pesa/bank

---

## 6. Open Questions for Implementation

- **Commission structure:** flat % per property, tiered, or negotiated per owner contract?
- **Tax/compliance:** does the agency need KRA e-TIMS invoice compliance for owner/supplier invoices?
- **Statutory payroll:** should PAYE/NSSF/SHIF calculations be automated (needs current KRA rates) or entered manually per run initially?
- **Approval limits:** does every payout/invoice need admin sign-off, or can staff approve under a threshold?
- **Historical data:** migrating from spreadsheets/another system, or starting fresh?
- **E-signatures:** are scanned/uploaded signed contracts good enough for v1, or does the agency need true e-signing (DocuSign-style) from the start?
- **Storage backend:** confirmed self-hosted (MinIO) vs external S3 for documents — affects how large the container stack needs to be
- **Self-managed pricing:** is the platform fee for self-managing landlords a flat monthly subscription, a small % of rent, or free (software given away to attract them toward agency-managed services later)?
- **Mode switching:** can a landlord move a property between self-managed and agency-managed themselves, or only staff/admin?
