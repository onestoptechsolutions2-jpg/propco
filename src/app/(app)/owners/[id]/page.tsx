import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  // Owners/landlords can view their own record; staff/admin can view any.
  const isStaff = user.role === "ADMIN" || user.role === "STAFF";
  if (!isStaff && user.ownerId !== id) notFound();

  const owner = await prisma.owner.findUnique({
    where: { id },
    include: { properties: { include: { units: true } } },
  });

  if (!owner) notFound();

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">{owner.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {owner.email || "No email"} · {owner.phone || "No phone"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {owner.isSelfManaging ? "Self-managing landlord" : "Agency-managed owner"} · Payout via{" "}
            {owner.payoutMethod ?? "not set"}
          </p>
        </div>
        {isStaff && (
          <Link
            href={`/owners/${owner.id}/edit`}
            className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-ink"
          >
            Edit
          </Link>
        )}
      </div>

      <h2 className="mt-10 font-serif text-lg text-ink">Properties</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {owner.properties.map((property) => (
          <Link
            key={property.id}
            href={`/properties/${property.id}`}
            className="rounded-lg border border-border bg-surface p-5 transition hover:border-ink"
          >
            <h3 className="font-serif text-lg text-ink">{property.name}</h3>
            <p className="mt-1 text-sm text-muted">{property.addressLine1}</p>
            <p className="mt-2 text-sm text-foreground">{property.units.length} units</p>
          </Link>
        ))}
        {owner.properties.length === 0 && (
          <p className="text-sm text-muted">No properties assigned yet.</p>
        )}
      </div>
    </div>
  );
}
