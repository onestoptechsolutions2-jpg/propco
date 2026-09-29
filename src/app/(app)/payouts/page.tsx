import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { generatePayouts, markPayoutPaid } from "./actions";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const fmt = (value: unknown) =>
  Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // STAFF/ADMIN manage payouts; OWNER gets a read-only view of their own.
  const user = await requireRole("STAFF", "OWNER");
  const isStaff = user.role === "ADMIN" || user.role === "STAFF";

  const params = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : currentMonth();
  const [year, mon] = month.split("-").map(Number);
  const periodStart = new Date(Date.UTC(year, mon - 1, 1));

  const payouts = await prisma.payout.findMany({
    where: {
      periodStart,
      owner: { orgId: user.orgId },
      ...(isStaff ? {} : { ownerId: user.ownerId ?? "__none__" }),
    },
    include: { owner: true },
    orderBy: { owner: { name: "asc" } },
  });

  const totals = payouts.reduce(
    (acc, p) => ({
      gross: acc.gross + Number(p.grossRent),
      commission: acc.commission + Number(p.commission),
      maintenance: acc.maintenance + Number(p.maintenance),
      net: acc.net + Number(p.netAmount),
    }),
    { gross: 0, commission: 0, maintenance: 0, net: 0 }
  );

  const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink">Owner payouts</h1>
          <p className="mt-1 text-sm text-muted">
            {monthLabel} · rent collected less commission and maintenance
          </p>
        </div>

        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <button
            type="submit"
            className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-ink"
          >
            View
          </button>
        </form>
      </div>

      {isStaff && (
        <form action={generatePayouts} className="mt-6 flex flex-wrap items-center gap-3">
          <input type="hidden" name="month" value={month} />
          <button
            type="submit"
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            {payouts.length > 0 ? "Recalculate" : "Generate"} payouts for {monthLabel}
          </button>
          <p className="text-xs text-muted">
            Uses rent marked <strong>Paid</strong> and due in this month. Payouts already marked paid
            are never changed.
          </p>
        </form>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Rent collected</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">Maintenance</th>
                <th className="px-4 py-3 text-right">Net payout (KES)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-medium text-foreground">{payout.owner.name}</td>
                  <td className="px-4 py-3 text-right text-foreground">{fmt(payout.grossRent)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{fmt(payout.commission)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{fmt(payout.maintenance)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{fmt(payout.netAmount)}</td>
                  <td className="px-4 py-3">
                    {payout.status === "PAID" ? (
                      <div>
                        <span className="rounded-full bg-accent-light px-2 py-1 text-xs font-medium text-accent">
                          Paid
                        </span>
                        <p className="mt-1 text-xs text-muted">
                          {payout.method} · {payout.paidDate?.toLocaleDateString()}
                          {payout.reference ? ` · ${payout.reference}` : ""}
                        </p>
                      </div>
                    ) : (
                      <span className="rounded-full bg-ink-light/10 px-2 py-1 text-xs font-medium text-ink">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isStaff && payout.status === "PENDING" && (
                      <form
                        action={markPayoutPaid.bind(null, payout.id)}
                        className="flex flex-wrap items-center justify-end gap-2"
                      >
                        <select
                          name="method"
                          defaultValue={payout.owner.payoutMethod === "bank" ? "BANK" : "MPESA"}
                          className="rounded border border-border px-2 py-1.5 text-xs outline-none focus:border-ink"
                        >
                          <option value="MPESA">M-Pesa</option>
                          <option value="BANK">Bank</option>
                        </select>
                        <input
                          name="reference"
                          placeholder="Reference"
                          className="w-28 rounded border border-border px-2 py-1.5 text-xs outline-none focus:border-ink"
                        />
                        <button type="submit" className="text-xs font-medium text-accent hover:underline">
                          Mark paid
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {payouts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                    No payouts for {monthLabel}
                    {isStaff ? " yet — generate them above once rent has been marked paid." : "."}
                  </td>
                </tr>
              )}
            </tbody>
            {payouts.length > 1 && (
              <tfoot className="border-t border-border bg-background text-sm font-medium">
                <tr>
                  <td className="px-4 py-3 text-muted">Total</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.gross)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.commission)}</td>
                  <td className="px-4 py-3 text-right">{fmt(totals.maintenance)}</td>
                  <td className="px-4 py-3 text-right text-ink">{fmt(totals.net)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
