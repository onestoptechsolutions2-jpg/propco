import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createMaintenanceRequest } from "../actions";

export default async function NewMaintenanceRequestPage() {
  const user = await requireRole("STAFF", "LANDLORD");

  const properties = await prisma.property.findMany({
    where: ownerScopeFilter(user),
    include: { units: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Log a maintenance request</h1>

      <form action={createMaintenanceRequest} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit</label>
          <select
            name="unitId"
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="">Select a unit…</option>
            {properties.map((property) => (
              <optgroup key={property.id} label={property.name}>
                {property.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">What&apos;s wrong</label>
          <textarea
            name="description"
            required
            rows={4}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Reported by (optional)</label>
          <input
            name="reportedBy"
            placeholder="Tenant name, or leave blank"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Rough cost estimate (KES, optional)
          </label>
          <input
            name="costEstimate"
            type="number"
            min={0}
            step="0.01"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Log request
        </button>
      </form>
    </div>
  );
}
