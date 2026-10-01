import { getManagedLease } from "@/lib/lease-access";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/PrintButton";
import { whatsappLink } from "@/lib/whatsapp";

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-");

/** Statement of what a tenant owes right now: unpaid rent plus unpaid utility bills. */
export default async function InvoicePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const { lease } = await getManagedLease(leaseId, "rent.manage");

  const [org, rent, bills] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: lease.unit.property.orgId } }),
    prisma.payment.findMany({
      where: { leaseId, status: { in: ["PENDING", "LATE", "FAILED"] } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.meterReading.findMany({
      where: { leaseId, status: "UNPAID", amount: { gt: 0 } },
      include: { meter: true },
      orderBy: { readingDate: "asc" },
    }),
  ]);

  const total = rent.reduce((s, p) => s + Number(p.amount), 0) + bills.reduce((s, b) => s + Number(b.amount), 0);
  const invoiceNo = `INV-${leaseId.slice(-6).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const wa = whatsappLink(
    lease.tenant.phone,
    `Hello ${lease.tenant.name}, your balance for ${lease.unit.property.name} ${lease.unit.label} is KES ${fmt(total)}. ${org.payInstructions ?? ""} Thank you.`.trim()
  );

  return (
    <div className="mx-auto max-w-2xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/rent/${leaseId}`} className="text-sm text-muted hover:underline">
          ← Back
        </a>
        <div className="flex items-center gap-3">
          {wa && total > 0 && (
            <a href={wa} target="_blank" rel="noopener" className="text-sm font-medium text-accent hover:underline">
              Send on WhatsApp
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="font-serif text-2xl text-ink">{org.name}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">Invoice / statement of account</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-foreground">{invoiceNo}</p>
            <p className="text-xs text-muted">{day(new Date())}</p>
          </div>
        </div>

        <div className="mt-5 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted">Bill to</p>
          <p className="mt-1 font-medium text-foreground">{lease.tenant.name}</p>
          <p className="text-muted">
            {lease.unit.property.name} · {lease.unit.label}
          </p>
        </div>

        <table className="mt-6 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1.5">Description</th>
              <th className="py-1.5">Due</th>
              <th className="py-1.5 text-right">KES</th>
            </tr>
          </thead>
          <tbody>
            {rent.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-1.5">
                  Rent, {p.dueDate.toLocaleString("en-US", { month: "long", year: "numeric" })}
                  {p.status === "LATE" && <span className="ml-2 text-xs text-danger">overdue</span>}
                </td>
                <td className="py-1.5">{day(p.dueDate)}</td>
                <td className="py-1.5 text-right">{fmt(p.amount)}</td>
              </tr>
            ))}
            {bills.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="py-1.5">
                  {b.meter.type.charAt(0) + b.meter.type.slice(1).toLowerCase()}
                  {b.meter.mode === "METERED"
                    ? ` (${Number(b.consumption)} ${b.meter.unitName})`
                    : " (monthly fee)"}
                </td>
                <td className="py-1.5">{day(b.readingDate)}</td>
                <td className="py-1.5 text-right">{fmt(b.amount)}</td>
              </tr>
            ))}
            {rent.length + bills.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={3} className="py-4 text-center text-muted">
                  Nothing outstanding. This account is fully paid.
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-ink font-serif text-lg text-ink">
              <td colSpan={2} className="py-3">
                Total due (KES)
              </td>
              <td className="py-3 text-right">{fmt(total)}</td>
            </tr>
          </tbody>
        </table>

        {org.payInstructions && (
          <div className="mt-6 rounded bg-background p-4 text-sm print:border print:border-border">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">How to pay</p>
            <p className="mt-1 whitespace-pre-wrap text-foreground">{org.payInstructions}</p>
          </div>
        )}
      </div>
    </div>
  );
}
