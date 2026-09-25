import { notFound } from "next/navigation";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createUnit } from "../../../actions";

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) notFound();
  if (!canManageOwnerRecords(user, property.ownerId)) notFound();

  const createUnitForProperty = createUnit.bind(null, property.id);

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Add a unit</h1>
      <p className="mt-1 text-sm text-muted">to {property.name}</p>

      <form action={createUnitForProperty} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit label</label>
          <input
            name="label"
            placeholder="e.g. Unit 3B"
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Bedrooms</label>
            <input
              name="bedrooms"
              type="number"
              min={0}
              className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Bathrooms</label>
            <input
              name="bathrooms"
              type="number"
              min={0}
              className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Monthly rent (KES)</label>
          <input
            name="rentAmount"
            type="number"
            min={0}
            step="0.01"
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Add unit
        </button>
      </form>
    </div>
  );
}
