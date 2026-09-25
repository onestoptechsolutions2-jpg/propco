import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createProperty } from "../actions";

export default async function NewPropertyPage() {
  const user = await requireRole("STAFF", "LANDLORD");

  const owners = await prisma.owner.findMany({
    where: user.role === "LANDLORD" && user.ownerId ? { id: user.ownerId } : {},
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl text-ink">Add a property</h1>
      <p className="mt-1 text-sm text-muted">
        A single-unit property gets one unit created for you automatically.
      </p>

      <form action={createProperty} className="mt-8 flex flex-col gap-4">
        <Field label="Property name" name="name" placeholder="e.g. Kilimani Heights" required />
        <Field label="Address" name="addressLine1" placeholder="Street address" required />
        <Field label="Address line 2" name="addressLine2" placeholder="Optional" />
        <Field label="City" name="city" placeholder="e.g. Mombasa" />

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Type</label>
          <select
            name="type"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
            defaultValue="SINGLE_UNIT"
          >
            <option value="SINGLE_UNIT">Single unit</option>
            <option value="BUILDING">Building (multiple units)</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Management mode</label>
          <select
            name="managementMode"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
            defaultValue={user.role === "LANDLORD" ? "SELF_MANAGED" : "AGENCY_MANAGED"}
          >
            <option value="AGENCY_MANAGED">Agency-managed — staff run it day to day</option>
            <option value="SELF_MANAGED">Self-managed — the landlord runs it directly</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Owner</label>
          <select
            name="ownerId"
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="">Select an owner…</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
          {owners.length === 0 && (
            <p className="mt-1 text-xs text-danger">
              No owners on file yet — add one first.
            </p>
          )}
        </div>

        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Create property
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
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
        placeholder={placeholder}
        required={required}
        className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
