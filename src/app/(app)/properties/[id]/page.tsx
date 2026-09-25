import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateUnitStatus } from "../actions";
import { UnitStatusSelect } from "@/components/UnitStatusSelect";

const STATUS_STYLES: Record<string, string> = {
  VACANT: "bg-accent-light text-accent",
  OCCUPIED: "bg-ink-light/10 text-ink",
  MAINTENANCE: "bg-danger/10 text-danger",
};

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const property = await prisma.property.findUnique({
    where: { id },
    include: { owner: true, units: { include: { leases: { where: { status: "ACTIVE" }, include: { tenant: true } } } } },
  });

  if (!property) notFound();

  const canEdit = canManageOwnerRecords(user, property.ownerId);

  if (user.role === "OWNER" && user.ownerId !== property.ownerId) notFound();
  if (user.role === "LANDLORD" && user.ownerId !== property.ownerId) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            {property.type === "SINGLE_UNIT" ? "Single unit" : "Building"} ·{" "}
            {property.managementMode === "AGENCY_MANAGED" ? "Agency-managed" : "Self-managed"}
          </p>
          <h1 className="font-serif text-3xl text-ink">{property.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {property.addressLine1}
            {property.addressLine2 ? `, ${property.addressLine2}` : ""}
            {property.city ? `, ${property.city}` : ""}
          </p>
          <p className="mt-2 text-sm text-foreground">
            Owner:{" "}
            <Link href={`/owners/${property.owner.id}`} className="text-accent hover:underline">
              {property.owner.name}
            </Link>
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link
              href={`/properties/${property.id}/edit`}
              className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-ink"
            >
              Edit
            </Link>
            <Link
              href={`/properties/${property.id}/units/new`}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
            >
              Add unit
            </Link>
          </div>
        )}
      </div>

      <h2 className="mt-10 font-serif text-lg text-ink">Units</h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Rent (KES)</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {property.units.map((unit) => {
              const activeLease = unit.leases[0];
              return (
                <tr key={unit.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{unit.label}</td>
                  <td className="px-4 py-3 text-foreground">
                    {Number(unit.rentAmount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {activeLease ? activeLease.tenant.name : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <UnitStatusSelect
                        unitId={unit.id}
                        currentStatus={unit.status}
                        action={async (unitId, status) => {
                          "use server";
                          await updateUnitStatus(property.id, unitId, status);
                        }}
                      />
                    ) : (
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[unit.status]}`}>
                        {unit.status}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {property.units.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                  No units yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
