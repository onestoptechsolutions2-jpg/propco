import Link from "next/link";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createInvoice, approveInvoice, rejectInvoice, payInvoice, deleteInvoice } from "./actions";
import type { InvoiceStatus } from "@prisma/client";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TABS: { key: InvoiceStatus | "ALL"; label: string }[] = [
  { key: "SUBMITTED", label: "To approve" },
  { key: "APPROVED", label: "To pay" },
  { key: "PAID", label: "Paid" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; added?: string }>;
}) {
  const user = await requireRole("STAFF", "LANDLORD");
  const { status, error, added } = await searchParams;
  const tab = TABS.find((t) => t.key === status)?.key ?? "SUBMITTED";

  const scopeWhere = {
    orgId: user.orgId,
    ...(user.role === "LANDLORD" ? { request: { unit: { property: ownerScopeFilter(user) } } } : {}),
  };

  const [invoices, counts, suppliers, requests, org] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: { ...scopeWhere, ...(tab === "ALL" ? {} : { status: tab }) },
      include: { supplier: true, request: { include: { unit: { include: { property: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.supplierInvoice.groupBy({ by: ["status"], where: scopeWhere, _count: true }),
    prisma.supplier.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
    prisma.maintenanceRequest.findMany({
      where: { unit: { property: ownerScopeFilter(user) }, status: { not: "CANCELLED" }, supplierId: { not: null } },
      include: { unit: { include: { property: true } }, supplier: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const limit = org.approvalLimit ? Number(org.approvalLimit) : null;

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl text-ink">Supplier invoices</h1>
      <p className="mt-1 text-sm text-muted">
        Enter what suppliers bill you, approve it, then pay it. Approved invoices linked to a repair charge the owner.
        {limit ? ` Invoices over KES ${limit.toLocaleString()} need an admin.` : ""}
      </p>

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {added && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">Invoice added and waiting for approval.</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/invoices?status=${t.key}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${tab === t.key ? "border-ink bg-ink text-white" : "border-border text-foreground hover:border-ink"}`}
          >
            {t.label}
            {t.key !== "ALL" && count(t.key) > 0 ? ` (${count(t.key)})` : ""}
          </Link>
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {invoices.map((inv) => (
          <li key={inv.id} className="rounded-lg border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">
                  {inv.supplier.name} {inv.number ? <span className="font-normal text-muted">· #{inv.number}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {inv.description}
                  {inv.request ? ` · ${inv.request.unit.property.name} ${inv.request.unit.label}` : ""}
                </p>
                <p className="text-xs text-muted">
                  Issued {inv.issueDate.toISOString().slice(0, 10)}
                  {inv.dueDate ? ` · due ${inv.dueDate.toISOString().slice(0, 10)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-ink">KES {fmt(inv.total)}</p>
                {Number(inv.vat) > 0 && <p className="text-xs text-muted">incl. VAT {fmt(inv.vat)}</p>}
                <p className="text-xs font-medium text-muted">{inv.status.toLowerCase()}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {inv.status === "SUBMITTED" && (
                <>
                  <form action={approveInvoice.bind(null, inv.id)}>
                    <button className="font-medium text-accent hover:underline">Approve</button>
                  </form>
                  <form action={rejectInvoice.bind(null, inv.id)} className="flex items-center gap-1">
                    <input name="note" placeholder="Reason" className={`${input} w-40 py-1`} />
                    <button className="text-danger hover:underline">Reject</button>
                  </form>
                </>
              )}
              {inv.status === "APPROVED" && (
                <form action={payInvoice.bind(null, inv.id)} className="flex flex-wrap items-center gap-2">
                  <select name="method" defaultValue={inv.supplier.payoutMethod === "bank" ? "BANK" : "MPESA"} className={`${input} py-1`}>
                    <option value="MPESA">M-Pesa</option>
                    <option value="BANK">Bank</option>
                    <option value="CASH">Cash</option>
                  </select>
                  <input name="reference" placeholder="Reference" className={`${input} w-32 py-1`} />
                  <button className="font-medium text-accent hover:underline">Mark paid</button>
                  {inv.supplier.mpesaNumber && <span className="text-muted">M-Pesa {inv.supplier.mpesaNumber}</span>}
                </form>
              )}
              {inv.status === "PAID" && (
                <span className="text-accent">
                  Paid {inv.paidAt?.toISOString().slice(0, 10)} via {inv.payMethod}
                  {inv.payRef ? ` · ${inv.payRef}` : ""}
                </span>
              )}
              {inv.status === "REJECTED" && inv.reviewNote && <span className="text-muted">Reason: {inv.reviewNote}</span>}
              {(inv.status === "SUBMITTED" || inv.status === "REJECTED") && (
                <form action={deleteInvoice.bind(null, inv.id)}>
                  <button className="text-muted hover:underline">Delete</button>
                </form>
              )}
            </div>
          </li>
        ))}
        {invoices.length === 0 && <li className="text-sm text-muted">Nothing here.</li>}
      </ul>

      <h2 className="mt-10 font-serif text-xl text-ink">Enter a supplier invoice</h2>
      <form action={createInvoice} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <select name="supplierId" required className={input} defaultValue="">
          <option value="">Which supplier?…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="requestId" className={input} defaultValue="">
          <option value="">Repair this is for (optional)…</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.supplier?.name}: {r.description.slice(0, 40)} ({r.unit.property.name} {r.unit.label})
            </option>
          ))}
        </select>
        <input name="description" required placeholder="What is it for? e.g. Replaced kitchen tap and pipes" className={input} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Amount before VAT (KES)</label>
            <input name="amount" type="number" min={1} step="0.01" required className={`${input} w-40`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Their invoice no.</label>
            <input name="number" className={`${input} w-36`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Due date</label>
            <input name="dueDate" type="date" className={input} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="addVat" className="h-4 w-4" />
          Add 16% VAT to this amount
        </label>
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save invoice</button>
      </form>
    </div>
  );
}
