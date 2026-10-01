import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { phoneTail } from "@/lib/mpesa-parse";
import { submitProof, approveProof, rejectProof } from "./actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ConfirmPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string; approved?: string }>;
}) {
  const user = await requirePermission("rent.manage");
  const { error, added, approved } = await searchParams;

  const [pending, recent, leases] = await Promise.all([
    prisma.paymentProof.findMany({
      where: { orgId: user.orgId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentProof.findMany({
      where: { orgId: user.orgId, status: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: 10,
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE", unit: { property: ownerScopeFilter(user) } },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        payments: { where: { status: { in: ["PENDING", "LATE", "FAILED"] } }, orderBy: { dueDate: "asc" }, take: 1 },
      },
      orderBy: { tenant: { name: "asc" } },
    }),
  ]);

  const till = process.env.BILLING_MPESA_TILL;

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Confirm M-Pesa payments</h1>
      <p className="mt-1 text-sm text-muted">
        Tenants pay by M-Pesa and send you the confirmation message. Paste it here, check the details, and approve.
        The rent list updates and the owner is told.
      </p>

      {error && (
        <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {added && (
        <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">
          Message added. Check it below and press Approve.
        </p>
      )}
      {approved && (
        <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">
          Payment approved and recorded.
        </p>
      )}

      <form action={submitProof} className="mt-6 rounded-lg border border-border bg-surface p-5">
        <label className="mb-1 block text-xs font-medium text-muted">Paste the M-Pesa confirmation message</label>
        <textarea
          name="message"
          required
          rows={4}
          placeholder="QGH7X8ABCD Confirmed. Ksh35,000.00 received from JOHN DOE 0712345678 on 5/8/25 at 2:15 PM..."
          className={`${input} w-full`}
        />
        <button className="mt-3 rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
          Read message
        </button>
        <p className="mt-2 text-xs text-muted">
          Tip: ask tenants to pay {till ? <strong>{till}</strong> : "your till or paybill"} using their unit as the
          account name, then forward the M-Pesa SMS to you on WhatsApp. Copy the text and paste it here.
        </p>
      </form>

      <h2 className="mt-8 font-serif text-xl text-ink">
        Waiting for you {pending.length > 0 && <span className="text-base text-muted">({pending.length})</span>}
      </h2>
      <div className="mt-3 flex flex-col gap-4">
        {pending.map((p) => {
          const tail = phoneTail(p.payerPhone);
          const guess = tail ? leases.find((l) => phoneTail(l.tenant.phone) === tail) : undefined;
          return (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-5">
              <p className="whitespace-pre-wrap break-words rounded bg-background p-3 text-xs text-muted">
                {p.rawMessage}
              </p>
              <p className="mt-2 text-xs text-muted">
                We read: {p.code ? `code ${p.code}` : "no code found"} ·{" "}
                {p.amount ? `KES ${fmt(p.amount)}` : "no amount found"} · {p.payerName ?? "no name"}{" "}
                {p.payerPhone ?? ""}
              </p>

              <form action={approveProof.bind(null, p.id)} className="mt-4 flex flex-col gap-3">
                <select name="leaseId" required defaultValue={guess?.id ?? ""} className={input}>
                  <option value="">Which tenant is this for?…</option>
                  {leases.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.tenant.name} · {l.unit.property.name} {l.unit.label}
                      {l.payments[0] ? ` · owes KES ${fmt(l.payments[0].amount)}` : " · nothing due"}
                    </option>
                  ))}
                </select>
                {guess && <p className="-mt-1 text-xs text-accent">Matched by phone number. Please double-check.</p>}
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted">Amount received (KES)</label>
                    <input
                      name="amount"
                      type="number"
                      min={1}
                      step="0.01"
                      required
                      defaultValue={p.amount ? Number(p.amount) : undefined}
                      className={`${input} w-40`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">M-Pesa code</label>
                    <input name="code" required defaultValue={p.code ?? ""} className={`${input} w-40 uppercase`} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
                    Approve payment
                  </button>
                </div>
              </form>

              <form action={rejectProof.bind(null, p.id)} className="mt-3 flex flex-wrap items-center gap-2">
                <input name="note" placeholder="Reason (optional)" className={`${input} w-56`} />
                <button className="text-xs font-medium text-danger hover:underline">Reject</button>
              </form>
            </div>
          );
        })}
        {pending.length === 0 && <p className="text-sm text-muted">Nothing waiting. You&apos;re all caught up.</p>}
      </div>

      {recent.length > 0 && (
        <>
          <h2 className="mt-10 font-serif text-xl text-ink">Recently handled</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  {p.code ?? "no code"} · {p.payerName ?? "unknown"}
                </span>
                <span className="text-xs text-muted">
                  {p.amount ? `KES ${fmt(p.amount)} · ` : ""}
                  {p.status === "APPROVED" ? "Approved" : `Rejected${p.reviewNote ? `: ${p.reviewNote}` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
