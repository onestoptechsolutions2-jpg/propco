import Link from "next/link";
import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function PropertiesPage() {
  const user = await requireUser();
  const isStaffLike = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LANDLORD";

  const properties = await prisma.property.findMany({
    where: ownerScopeFilter(user),
    include: { owner: true, units: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Properties</h1>
          <p className="mt-1 text-sm text-muted">
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>
        {isStaffLike && (
          <Link
            href="/properties/new"
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            Add property
          </Link>
        )}
      </div>

      {properties.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border bg-surface p-10 text-center">
          <p className="text-sm text-muted">No properties yet.</p>
          {isStaffLike && (
            <Link href="/properties/new" className="mt-2 inline-block text-sm text-accent hover:underline">
              Add your first property
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const occupied = property.units.filter((u) => u.status === "OCCUPIED").length;
            return (
              <Link
                key={property.id}
                href={`/properties/${property.id}`}
                className="rounded-lg border border-border bg-surface p-5 transition hover:border-ink"
              >
                <div className="flex items-start justify-between">
                  <h2 className="font-serif text-lg text-ink">{property.name}</h2>
                  <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] text-accent">
                    {property.type === "SINGLE_UNIT" ? "Single unit" : "Building"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{property.addressLine1}</p>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted">
                  {property.owner.name}
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {occupied}/{property.units.length} units occupied
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
