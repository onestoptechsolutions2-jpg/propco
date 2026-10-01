import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { tenantReliability } from "@/lib/reliability";
import { PrintButton } from "@/components/PrintButton";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "present");

/** Printable tenant payment reference: what a tenant can show a future landlord or a lender. */
export default async function TenantReferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("tenants.manage");

  const tenant = await prisma.tenant.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      leases: {
        where: { unit: { property: ownerScopeFilter(user) } },
        include: { unit: { include: { property: true } } },
        orderBy: { startDate: "asc" },
      },
    },
  });
  if (!tenant || tenant.leases.length === 0) notFound();

  const [r, org] = await Promise.all([
    tenantReliability(tenant.id, user.orgId),
    prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/tenants/${tenant.id}/edit`} className="text-sm text-muted hover:underline">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 print:border-0 print:p-0">
        <div className="border-b border-border pb-4">
          <p className="font-serif text-2xl text-ink">{org.name}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">Tenant payment reference</p>
        </div>

        <p className="mt-5 text-sm">
          This confirms the rent payment record of <strong>{tenant.name}</strong> with {org.name}, issued on{" "}
          {day(new Date())}.
        </p>

        <h2 className="mt-6 font-serif text-lg text-ink">Tenancies</h2>
        <ul className="mt-2 text-sm">
          {tenant.leases.map((l) => (
            <li key={l.id} className="border-t border-border py-1.5">
              {l.unit.property.name} · {l.unit.label}: {day(l.startDate)} to {l.status === "ACTIVE" ? "present" : day(l.endDate)}
            </li>
          ))}
        </ul>

        <h2 className="mt-6 font-serif text-lg text-ink">Payment record</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Months due", r.periods],
            ["Paid on time", r.onTime],
            ["Paid late", r.late],
            ["Unpaid", r.unpaid],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded border border-border p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
            </div>
          ))}
        </div>

        <p className="mt-5 text-sm">
          Reliability rating: <strong>{r.rating}</strong>
          {r.score !== null && ` (${r.score}/100)`}
          {r.late > 0 && `. Late payments averaged ${r.avgDaysLate} days after the due date.`}
        </p>

        <p className="mt-8 text-xs text-muted">
          Based on payments recorded in PropCo. Issued at the tenant&apos;s request. Please share only with their
          consent.
        </p>
        <div className="mt-10 w-56 border-t border-border pt-2 text-xs text-muted">For {org.name}</div>
      </div>
    </div>
  );
}
