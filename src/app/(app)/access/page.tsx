import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { UpgradeCard } from "@/components/UpgradeCard";
import { createAccessCode, revokeAccessCode } from "./actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function AccessPage() {
  const user = await requireRole("STAFF", "LANDLORD");
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Door access codes" isAdmin={user.role === "ADMIN"} />;
  }

  const [properties, codes] = await Promise.all([
    prisma.property.findMany({
      where: ownerScopeFilter(user),
      orderBy: { name: "asc" },
      include: { units: { orderBy: { label: "asc" } } },
    }),
    prisma.accessCode.findMany({
      where: { unit: { property: ownerScopeFilter(user) }, active: true },
      include: { unit: { include: { property: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const now = new Date();

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Door access codes</h1>
      <p className="mt-1 text-sm text-muted">
        Keep track of who has a keypad or smart-lock code for each unit. Codes are cancelled automatically when a
        tenant moves out or a guest checks out. Set the same code on the lock, then share it here.
      </p>

      <form action={createAccessCode} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap gap-3">
          <select name="unitId" required className={input} defaultValue="">
            <option value="">Choose a unit…</option>
            {properties.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input name="label" placeholder="Who is it for? e.g. Caretaker" className={`${input} w-56`} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Code (leave blank to generate one)</label>
            <input name="code" inputMode="numeric" placeholder="e.g. 482913" className={`${input} w-44`} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Expires (optional)</label>
            <input name="validTo" type="date" className={input} />
          </div>
          <button className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
            Create code
          </button>
        </div>
      </form>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {codes.map((c) => {
          const expired = !!c.validTo && c.validTo < now;
          const share = `https://wa.me/?text=${encodeURIComponent(
            `Your door code for ${c.unit.property.name} · ${c.unit.label} is ${c.code}.${c.validTo ? ` Valid until ${c.validTo.toISOString().slice(0, 10)}.` : ""}`
          )}`;
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  {c.unit.property.name} · {c.unit.label}
                </p>
                <p className="text-xs text-muted">
                  {c.label}
                  {c.validTo ? ` · until ${c.validTo.toISOString().slice(0, 10)}` : " · no expiry"}
                  {expired ? " · expired" : ""}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded bg-background px-3 py-1 font-mono text-base tracking-widest text-ink">{c.code}</span>
                <a href={share} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">
                  Share on WhatsApp
                </a>
                <form action={revokeAccessCode.bind(null, c.id)}>
                  <button className="text-xs text-danger hover:underline">Cancel</button>
                </form>
              </div>
            </li>
          );
        })}
        {codes.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No active codes yet.</li>}
      </ul>
    </div>
  );
}
