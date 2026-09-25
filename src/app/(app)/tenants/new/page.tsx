import { requireRole } from "@/lib/access";
import { createTenant } from "../actions";

export default async function NewTenantPage() {
  await requireRole("STAFF", "LANDLORD");

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Add a tenant</h1>
      <p className="mt-1 text-sm text-muted">
        You can lease them into a unit right after saving.
      </p>

      <form action={createTenant} className="mt-8 flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-muted">
            Full name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-xs font-medium text-muted">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            placeholder="+254…"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Add tenant
        </button>
      </form>
    </div>
  );
}
