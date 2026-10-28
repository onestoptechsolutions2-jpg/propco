import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { holdAndOwe } from "@/lib/owner-money";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function OwnerMoneyPage() {
  const user = await requirePermission("books.manage");
  const { owners, heldForOwners } = await holdAndOwe(user.orgId);

  return (
    <div className="max-w-3xl">
      <Link href="/books" className="text-xs text-muted hover:underline">← Books</Link>
      <h1 className="mt-1 font-serif text-3xl text-ink">Money held for owners</h1>
      <p className="mt-1 text-sm text-muted">
        Rent collected for landlords you manage, less your commission, completed repairs and payouts already sent.
        This is not your money: keep it in the owners&apos; account until you pay it out.
      </p>
      <p className="mt-4 text-2xl font-medium text-ink">KES {fmt(heldForOwners)} <span className="text-sm font-normal text-muted">held in total</span></p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Collected</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Repairs</th><th className="px-4 py-3">Paid out</th><th className="px-4 py-3">Held</th></tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.ownerId} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-ink">{o.name}</td>
                  <td className="px-4 py-3">{fmt(o.collected)}</td>
                  <td className="px-4 py-3">{fmt(o.commission)}</td>
                  <td className="px-4 py-3">{fmt(o.maintenance)}</td>
                  <td className="px-4 py-3">{fmt(o.paidOut)}</td>
                  <td className="px-4 py-3 font-medium">{fmt(o.held)}</td>
                </tr>
              ))}
              {owners.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No agency-managed owners yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-right text-xs"><a href="/books/owners/export" className="text-accent underline">Download CSV</a></p>
    </div>
  );
}
