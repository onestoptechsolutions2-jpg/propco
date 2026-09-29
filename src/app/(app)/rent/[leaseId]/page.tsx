import { notFound } from "next/navigation";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { recordPayment, markPaymentPaid } from "../actions";

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-accent-light text-accent",
  LATE: "bg-danger/10 text-danger",
  FAILED: "bg-danger/10 text-danger",
  PENDING: "bg-ink-light/10 text-ink",
};

export default async function LeasePaymentsPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const user = await requireUser();

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      tenant: true,
      unit: { include: { property: { include: { owner: true } } } },
      payments: { orderBy: { dueDate: "desc" } },
    },
  });

  if (!lease || lease.unit.property.orgId !== user.orgId) notFound();
  if (!canManageOwnerRecords(user, lease.unit.property.ownerId, lease.unit.property.orgId) && user.role !== "OWNER") notFound();
  if (user.role === "OWNER" && user.ownerId !== lease.unit.property.ownerId) notFound();

  const canRecord = canManageOwnerRecords(user, lease.unit.property.ownerId, lease.unit.property.orgId);
  const recordPaymentForLease = recordPayment.bind(null, lease.id);

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">
        {lease.unit.property.name} · {lease.unit.label}
      </p>
      <h1 className="font-serif text-3xl text-ink">{lease.tenant.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Rent {Number(lease.rentAmount).toLocaleString()} KES/month · Lease started{" "}
        {lease.startDate.toLocaleDateString()}
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg text-ink">Payment history</h2>
            {canRecord && (
              <a href={`/rent/${lease.id}/invoice`} className="text-sm font-medium text-accent hover:underline">
                Invoice / statement
              </a>
            )}
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-background text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {lease.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-border">
                      <td className="px-4 py-3 text-foreground">
                        {payment.dueDate.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {Number(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-foreground">{payment.method}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[payment.status]}`}
                        >
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {payment.status === "PAID" && (
                          <a
                            href={`/rent/${lease.id}/receipt/${payment.id}`}
                            className="text-accent hover:underline"
                          >
                            Receipt
                          </a>
                        )}
                        {canRecord && payment.status !== "PAID" && (
                          <form
                            action={async () => {
                              "use server";
                              await markPaymentPaid(lease.id, payment.id);
                            }}
                          >
                            <button type="submit" className="text-accent hover:underline">
                              Mark paid
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {lease.payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                        No payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {canRecord && (
          <div>
            <h2 className="font-serif text-lg text-ink">Record a payment</h2>
            <form action={recordPaymentForLease} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Amount (KES)</label>
                <input
                  type="number"
                  name="amount"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={Number(lease.rentAmount)}
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Due date</label>
                <input
                  type="date"
                  name="dueDate"
                  required
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Paid date</label>
                <input
                  type="date"
                  name="paidDate"
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Method</label>
                <select
                  name="method"
                  defaultValue="MPESA"
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                >
                  <option value="MPESA">M-Pesa</option>
                  <option value="BANK">Bank transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Status</label>
                <select
                  name="status"
                  defaultValue="PAID"
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                >
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="LATE">Late</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Reference (M-Pesa code / bank ref)
                </label>
                <input
                  name="reference"
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <button
                type="submit"
                className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
              >
                Save payment
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
