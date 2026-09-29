import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagedLease } from "@/lib/lease-access";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/PrintButton";

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-");

export default async function ClearancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lease } = await getManagedLease(id);
  if (lease.status !== "ENDED" || !lease.depositSettledAt) notFound();

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: lease.unit.property.orgId } });
  const checklists = await prisma.checklist.findMany({ where: { leaseId: id }, include: { items: true } });
  const moveIn = checklists.find((c) => c.type === "MOVE_IN");
  const moveOut = checklists.find((c) => c.type === "MOVE_OUT");
  const inventory = (moveOut?.items ?? [])
    .filter((i) => i.category === "INVENTORY")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const before = new Map((moveIn?.items ?? []).map((i) => [i.label, i.condition]));
  const bills = await prisma.meterReading.findMany({
    where: { leaseId: id, notes: { contains: "Settled from deposit" } },
    include: { meter: true },
  });
  const arrears = await prisma.payment.findMany({
    where: { leaseId: id, notes: { contains: "Settled from deposit" } },
    orderBy: { dueDate: "asc" },
  });

  const refund = Number(lease.depositRefund ?? 0);

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/leases" className="text-sm text-muted hover:underline">
          ← Back
        </Link>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 print:border-0 print:p-0">
        <div className="border-b border-border pb-5">
          <p className="font-serif text-2xl text-ink">{org.name}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">Unit clearance and deposit settlement</p>
        </div>

        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Tenant</p>
            <p className="mt-1 font-medium text-foreground">{lease.tenant.name}</p>
            <p className="text-muted">{lease.tenant.phone ?? ""}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Unit</p>
            <p className="mt-1 font-medium text-foreground">
              {lease.unit.property.name} · {lease.unit.label}
            </p>
            <p className="text-muted">
              {day(lease.startDate)} to {day(lease.endDate)}
            </p>
          </div>
        </div>

        <h2 className="mt-8 font-serif text-lg text-ink">Condition of the unit</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1.5">Item</th>
              <th className="py-1.5">At move-in</th>
              <th className="py-1.5">At move-out</th>
              <th className="py-1.5 text-right">Charge KES</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="py-1.5">
                  {i.label}
                  {i.notes && <p className="text-xs text-muted">{i.notes}</p>}
                </td>
                <td className="py-1.5 text-muted">{before.get(i.label) ?? "-"}</td>
                <td className="py-1.5">{i.condition ?? "-"}</td>
                <td className="py-1.5 text-right">{Number(i.cost) > 0 ? fmt(i.cost) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-8 font-serif text-lg text-ink">Deposit settlement</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1.5">Deposit held</td>
              <td className="py-1.5 text-right">{fmt(lease.depositAmount)}</td>
            </tr>
            {inventory
              .filter((i) => Number(i.cost) > 0)
              .map((i) => (
                <tr key={i.id}>
                  <td className="py-1.5 text-muted">Less: {i.label}</td>
                  <td className="py-1.5 text-right text-muted">-{fmt(i.cost)}</td>
                </tr>
              ))}
            {bills.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5 text-muted">
                  Less: {b.meter.type.toLowerCase()} bill ({day(b.readingDate)})
                </td>
                <td className="py-1.5 text-right text-muted">-{fmt(b.amount)}</td>
              </tr>
            ))}
            {arrears.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5 text-muted">Less: unpaid rent due {day(p.dueDate)}</td>
                <td className="py-1.5 text-right text-muted">-{fmt(p.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-serif text-lg text-ink">
              <td className="py-3">{refund >= 0 ? "Refund to tenant (KES)" : "Balance owed by tenant (KES)"}</td>
              <td className="py-3 text-right">{fmt(Math.abs(refund))}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          {refund >= 0 && lease.depositMethod && lease.depositMethod !== "NONE"
            ? `Refund via ${lease.depositMethod}${lease.depositRef ? `, reference ${lease.depositRef}` : ""}.`
            : ""}
          {lease.settlementNotes ? ` ${lease.settlementNotes}` : ""}
        </p>

        <p className="mt-6 text-sm">
          The unit was handed back on {day(lease.endDate)} and this tenancy is closed.
        </p>

        <div className="mt-12 grid grid-cols-2 gap-10 text-xs text-muted">
          <div className="border-t border-border pt-2">Tenant signature</div>
          <div className="border-t border-border pt-2">For {org.name}</div>
        </div>
      </div>
    </div>
  );
}
