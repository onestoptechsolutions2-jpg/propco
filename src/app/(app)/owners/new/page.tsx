import { requireRole } from "@/lib/access";
import { createOwner } from "../actions";

export default async function NewOwnerPage() {
  await requireRole("STAFF");

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Add an owner</h1>

      <form action={createOwner} className="mt-8 flex flex-col gap-4">
        <Field label="Full name" name="name" required />
        <Field label="Email" name="email" type="email" />
        <Field label="Phone" name="phone" placeholder="+254…" />
        <Field label="M-Pesa number" name="mpesaNumber" placeholder="For payouts" />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Preferred payout method</label>
          <select
            name="payoutMethod"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
            defaultValue="mpesa"
          >
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank transfer</option>
            <option value="card">Card</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="isSelfManaging" className="h-4 w-4 rounded border-border" />
          This owner manages their own properties (self-managing landlord)
        </label>

        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Add owner
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
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
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
