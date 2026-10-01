import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { UpgradeCard } from "@/components/UpgradeCard";
import { createMeter } from "../../actions";

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function NewMeterPage() {
  const user = await requirePermission("utilities.manage");
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Utilities billing" isAdmin={user.can("billing.manage")} />;
  }

  const properties = await prisma.property.findMany({
    where: ownerScopeFilter(user),
    orderBy: { name: "asc" },
    include: { units: { orderBy: { label: "asc" } } },
  });

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Add a meter or service</h1>
      <p className="mt-1 text-sm text-muted">
        Metered services (water, electricity) are billed from readings. Flat services (internet) charge the same
        amount every month.
      </p>

      <form action={createMeter} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit</label>
          <select name="unitId" required className={input}>
            <option value="">Choose a unit…</option>
            {properties.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">What is it?</label>
          <select name="type" className={input} defaultValue="WATER">
            <option value="WATER">Water</option>
            <option value="ELECTRICITY">Electricity</option>
            <option value="INTERNET">Internet</option>
            <option value="GAS">Gas</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">How is it billed?</label>
          <select name="mode" className={input} defaultValue="METERED">
            <option value="METERED">By meter reading (rate per unit used)</option>
            <option value="FIXED">Flat monthly fee</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Rate (KES per unit used, or the monthly fee)</label>
          <input name="rate" type="number" min={0} step="0.01" required className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit of measure (e.g. m3, kWh)</label>
          <input name="unitName" placeholder="m3" className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Meter or account number (optional)</label>
          <input name="label" className={input} />
        </div>
        <button className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
          Save meter
        </button>
      </form>
    </div>
  );
}
