import { requireRole } from "@/lib/access";
import { createSupplier } from "../actions";

export default async function NewSupplierPage() {
  await requireRole("STAFF", "LANDLORD");

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Add a supplier</h1>

      <form action={createSupplier} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Name</label>
          <input
            name="name"
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Trade</label>
          <select
            name="trade"
            defaultValue="GENERAL"
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
            placeholder="+254…"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Email</label>
          <input
            name="email"
            type="email"
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
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">M-Pesa number</label>
          <input
            name="mpesaNumber"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Add supplier
        </button>
      </form>
    </div>
  );
}
