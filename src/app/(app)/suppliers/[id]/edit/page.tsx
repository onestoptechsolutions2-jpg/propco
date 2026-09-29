import { notFound } from "next/navigation";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateSupplier, deleteSupplier } from "../../actions";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole("STAFF", "LANDLORD");

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  const updateSupplierWithId = updateSupplier.bind(null, supplier.id);
  const deleteSupplierWithId = deleteSupplier.bind(null, supplier.id);

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Edit supplier</h1>

      <form action={updateSupplierWithId} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Name</label>
          <input
            name="name"
            defaultValue={supplier.name}
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Trade</label>
          <select
            name="trade"
            defaultValue={supplier.trade}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="PLUMBER">Plumber</option>
            <option value="ELECTRICIAN">Electrician</option>
            <option value="CARPENTER">Carpenter</option>
            <option value="PAINTER">Painter</option>
            <option value="GENERAL">General</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
          <input
            name="phone"
            defaultValue={supplier.phone ?? ""}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={supplier.email ?? ""}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Typical call-out rate (KES, optional)
          </label>
          <input
            name="rate"
            type="number"
            min={0}
            step="0.01"
            defaultValue={supplier.rate ? Number(supplier.rate) : undefined}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">M-Pesa number</label>
          <input
            name="mpesaNumber"
            defaultValue={supplier.mpesaNumber ?? ""}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Save changes
        </button>
      </form>

      <form action={deleteSupplierWithId} className="mt-6 border-t border-border pt-6">
        <p className="text-xs text-muted">
          Deleting a supplier is only possible once they have no maintenance jobs assigned.
        </p>
        <button
          type="submit"
          className="mt-2 rounded border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5"
        >
          Delete supplier
        </button>
      </form>
    </div>
  );
}
