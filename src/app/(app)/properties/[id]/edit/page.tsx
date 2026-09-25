import { notFound } from "next/navigation";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateProperty, deleteProperty } from "../../actions";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const [property, owners] = await Promise.all([
    prisma.property.findUnique({ where: { id } }),
    prisma.owner.findMany({
      where: user.role === "LANDLORD" && user.ownerId ? { id: user.ownerId } : {},
      orderBy: { name: "asc" },
    }),
  ]);

  if (!property) notFound();
  if (!canManageOwnerRecords(user, property.ownerId)) notFound();

  const updatePropertyWithId = updateProperty.bind(null, property.id);
  const deletePropertyWithId = deleteProperty.bind(null, property.id);

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl text-ink">Edit property</h1>

      <form action={updatePropertyWithId} className="mt-8 flex flex-col gap-4">
        <Field label="Property name" name="name" defaultValue={property.name} required />
        <Field label="Address" name="addressLine1" defaultValue={property.addressLine1} required />
        <Field label="Address line 2" name="addressLine2" defaultValue={property.addressLine2 ?? ""} />
        <Field label="City" name="city" defaultValue={property.city ?? ""} />

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Type</label>
          <select
            name="type"
            defaultValue={property.type}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="SINGLE_UNIT">Single unit</option>
            <option value="BUILDING">Building (multiple units)</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Management mode</label>
          <select
            name="managementMode"
            defaultValue={property.managementMode}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="AGENCY_MANAGED">Agency-managed</option>
            <option value="SELF_MANAGED">Self-managed</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Owner</label>
          <select
            name="ownerId"
            required
            defaultValue={property.ownerId}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="submit"
            className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            Save changes
          </button>
        </div>
      </form>

      <form action={deletePropertyWithId} className="mt-6 border-t border-border pt-6">
        <p className="text-xs text-muted">
          Deleting a property removes all its units and lease history.
        </p>
        <button
          type="submit"
          className="mt-2 rounded border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5"
        >
          Delete property
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
