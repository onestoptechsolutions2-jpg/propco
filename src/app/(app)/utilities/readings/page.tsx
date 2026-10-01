import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { UpgradeCard } from "@/components/UpgradeCard";
import { recordReadings } from "../actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function ReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const user = await requirePermission("utilities.manage");
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Utilities billing" isAdmin={user.can("billing.manage")} />;
  }
  const params = await searchParams;

  const properties = await prisma.property.findMany({
    where: ownerScopeFilter(user),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const propertyId = properties.find((p) => p.id === params.property)?.id ?? properties[0]?.id;

  const meters = propertyId
    ? await prisma.utilityMeter.findMany({
        where: { active: true, unit: { propertyId } },
        orderBy: [{ unit: { label: "asc" } }, { type: "asc" }],
        include: {
          unit: { include: { leases: { where: { status: "ACTIVE" }, include: { tenant: true }, take: 1 } } },
          readings: { orderBy: [{ readingDate: "desc" }, { createdAt: "desc" }], take: 1 },
        },
      })
    : [];

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Record readings</h1>
      <p className="mt-1 text-sm text-muted">
        Walk the property, type each meter&apos;s current reading, and save. Tenants are billed and told by message.
        Leave a meter blank to skip it.
      </p>

      <form method="get" className="mt-6 flex items-center gap-2">
        <select name="property" defaultValue={propertyId} className={input}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink">Show</button>
      </form>

      {meters.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No meters on this property yet. Add one from the Utilities page.</p>
      ) : (
        <form action={recordReadings} className="mt-6">
          <input type="hidden" name="propertyId" value={propertyId} />
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Reading date</label>
              <input type="date" name="readingDate" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">What are these readings?</label>
              <select name="kind" defaultValue="BILL" className={input}>
                <option value="BILL">Normal monthly readings (bill the tenant)</option>
                <option value="OPENING">Opening readings for a new tenant (no bill)</option>
              </select>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
            <ul className="divide-y divide-border">
              {meters.map((m) => {
                const tenant = m.unit.leases[0]?.tenant;
                const last = m.readings[0];
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">
                        {m.unit.label} · {m.type.charAt(0) + m.type.slice(1).toLowerCase()}
                      </p>
                      <p className="text-xs text-muted">
                        {tenant ? tenant.name : "Vacant"}
                        {m.mode === "METERED" && ` · last reading ${last ? Number(last.reading) : "none yet"}`}
                      </p>
                    </div>
                    {m.mode === "METERED" ? (
                      <input
                        name={`reading_${m.id}`}
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        placeholder={`Now (${m.unitName})`}
                        className={`${input} w-40`}
                      />
                    ) : (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={`bill_${m.id}`} className="h-4 w-4" />
                        Bill KES {Number(m.rate).toLocaleString()} this month
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <button className="mt-5 rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
            Save readings and bill tenants
          </button>
        </form>
      )}
    </div>
  );
}
