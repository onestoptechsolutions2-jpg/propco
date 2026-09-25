import { notFound } from "next/navigation";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateOwner, deleteOwner } from "../../actions";

export default async function EditOwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("STAFF");

  const owner = await prisma.owner.findUnique({ where: { id } });
  if (!owner) notFound();

  const updateOwnerWithId = updateOwner.bind(null, owner.id);
  const deleteOwnerWithId = deleteOwner.bind(null, owner.id);

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Edit owner</h1>

      <form action={updateOwnerWithId} className="mt-8 flex flex-col gap-4">
        <Field label="Full name" name="name" defaultValue={owner.name} required />
        <Field label="Email" name="email" type="email" defaultValue={owner.email ?? ""} />
        <Field label="Phone" name="phone" defaultValue={owner.phone ?? ""} />
        <Field label="M-Pesa number" name="mpesaNumber" defaultValue={owner.mpesaNumber ?? ""} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Preferred payout method</label>
          <select
            name="payoutMethod"
            defaultValue={owner.payoutMethod ?? "mpesa"}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank transfer</option>
            <option value="card">Card</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="isSelfManaging"
            defaultChecked={owner.isSelfManaging}
            className="h-4 w-4 rounded border-border"
          />
          This owner manages their own properties (self-managing landlord)
        </label>

        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Save changes
        </button>
      </form>

      <form action={deleteOwnerWithId} className="mt-6 border-t border-border pt-6">
        <p className="text-xs text-muted">
          Deleting an owner is only possible once they have no properties assigned.
        </p>
        <button
          type="submit"
          className="mt-2 rounded border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5"
        >
          Delete owner
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
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
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
