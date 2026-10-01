import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/PrintButton";

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-");

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("payouts.view");
  const isStaff = user.role === "ADMIN" || user.role === "STAFF";

  const payout = await prisma.payout.findFirst({
    where: {
      id,
      owner: { orgId: user.orgId },
      ...(isStaff ? {} : { ownerId: user.ownerId ?? "__none__" }),
    },
    include: { owner: { include: { org: true } } },
  });
  if (!payout) notFound();

  const properties = await prisma.property.findMany({
    where: { ownerId: payout.ownerId, managementMode: "AGENCY_MANAGED" },
    orderBy: { name: "asc" },
    include: {
      units: {
        include: {
          maintenanceRequests: {
            where: { status: "DONE", completedAt: { gte: payout.periodStart, lte: payout.periodEnd } },
            include: { supplier: true },
          },
          leases: {
            include: {
              tenant: true,
              payments: { where: { status: "PAID", dueDate: { gte: payout.periodStart, lte: payout.periodEnd } } },
            },
          },
        },
      },
    },
  });

  const month = payout.periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const sections = properties
    .map((p) => {
      const rent = p.units.flatMap((u) =>
        u.leases.flatMap((l) =>
          l.payments.map((pay) => ({
            id: pay.id,
            unit: u.label,
            tenant: l.tenant.name,
            paid: pay.paidDate,
            ref: pay.reference,
            amount: Number(pay.amount),
          }))
        )
      );
      const repairs = p.units.flatMap((u) =>
        u.maintenanceRequests.map((r) => ({
          id: r.id,
          unit: u.label,
          description: r.description,
          supplier: r.supplier?.name,
          amount: Number(r.actualCost ?? 0),
        }))
      );
      const gross = rent.reduce((s, r) => s + r.amount, 0);
      const commission = (gross * Number(p.commissionPct)) / 100;
      return { property: p, rent, repairs, gross, commission };
    })
    .filter((s) => s.rent.length > 0 || s.repairs.length > 0);

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href="/payouts" className="text-sm text-muted hover:underline">
          ← Back to payouts
        </a>
        <PrintButton />
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="font-serif text-2xl text-ink">{payout.owner.org.name}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">Owner statement</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-foreground">{month}</p>
            <p className="text-xs text-muted">
              {day(payout.periodStart)} to {day(payout.periodEnd)}
            </p>
          </div>
        </div>

        <div className="mt-5 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted">Prepared for</p>
          <p className="mt-1 font-medium text-foreground">{payout.owner.name}</p>
          {payout.owner.email && <p className="text-muted">{payout.owner.email}</p>}
          {payout.owner.phone && <p className="text-muted">{payout.owner.phone}</p>}
        </div>

        {sections.map(({ property, rent, repairs, gross, commission }) => (
          <div key={property.id} className="mt-8 break-inside-avoid">
            <h2 className="font-serif text-lg text-ink">{property.name}</h2>
            <p className="text-xs text-muted">
              {property.addressLine1}
              {property.city ? `, ${property.city}` : ""} · Commission {Number(property.commissionPct)}%
            </p>

            {rent.length > 0 && (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1.5">Rent received</th>
                    <th className="py-1.5">Paid on</th>
                    <th className="py-1.5">Reference</th>
                    <th className="py-1.5 text-right">KES</th>
                  </tr>
                </thead>
                <tbody>
                  {rent.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5">
                        {r.unit} · {r.tenant}
                      </td>
                      <td className="py-1.5">{day(r.paid)}</td>
                      <td className="py-1.5 text-muted">{r.ref ?? "-"}</td>
                      <td className="py-1.5 text-right">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-medium">
                    <td colSpan={3} className="py-1.5">
                      Rent subtotal
                    </td>
                    <td className="py-1.5 text-right">{fmt(gross)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="py-1.5 text-muted">
                      Management commission ({Number(property.commissionPct)}%)
                    </td>
                    <td className="py-1.5 text-right text-muted">-{fmt(commission)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {repairs.length > 0 && (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1.5">Repairs and maintenance</th>
                    <th className="py-1.5">Supplier</th>
                    <th className="py-1.5 text-right">KES</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5">
                        {r.unit} · {r.description}
                      </td>
                      <td className="py-1.5 text-muted">{r.supplier ?? "-"}</td>
                      <td className="py-1.5 text-right">-{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        {sections.length === 0 && (
          <p className="mt-8 text-sm text-muted">No rent or repair activity was found for this period.</p>
        )}

        <table className="mt-8 w-full break-inside-avoid text-sm">
          <tbody>
            <tr className="border-t border-border">
              <td className="py-2">Total rent received</td>
              <td className="py-2 text-right">{fmt(payout.grossRent)}</td>
            </tr>
            <tr>
              <td className="py-2">Less: management commission</td>
              <td className="py-2 text-right">-{fmt(payout.commission)}</td>
            </tr>
            <tr>
              <td className="py-2">Less: repairs and maintenance</td>
              <td className="py-2 text-right">-{fmt(payout.maintenance)}</td>
            </tr>
            <tr className="border-t-2 border-ink font-serif text-lg text-ink">
              <td className="py-3">Net payout (KES)</td>
              <td className="py-3 text-right">{fmt(payout.netAmount)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4 text-xs text-muted">
          {payout.status === "PAID"
            ? `Paid on ${day(payout.paidDate)} via ${payout.method}${payout.reference ? `, reference ${payout.reference}` : ""}.`
            : "This payout is pending and has not been paid yet."}
        </p>
      </div>
    </div>
  );
}
