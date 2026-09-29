import Link from "next/link";
import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function InsightsPage() {
  const user = await requireUser();
  const scope = ownerScopeFilter(user);
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const [units, payments, repairs, lateLeases] = await Promise.all([
    prisma.unit.findMany({ where: { property: scope }, select: { status: true } }),
    prisma.payment.findMany({
      where: { dueDate: { gte: since, lte: now }, lease: { unit: { property: scope } } },
      select: { amount: true, dueDate: true, status: true },
    }),
    prisma.maintenanceRequest.findMany({
      where: { status: "DONE", completedAt: { gte: yearAgo }, unit: { property: scope } },
      select: { actualCost: true, unit: { select: { property: { select: { name: true } } } } },
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE", unit: { property: scope }, payments: { some: { status: "LATE" } } },
      select: {
        id: true,
        tenant: { select: { name: true } },
        unit: { select: { label: true, property: { select: { name: true } } } },
        payments: { where: { status: "LATE" }, select: { amount: true } },
      },
    }),
  ]);

  // Occupancy
  const occupied = units.filter((u) => u.status === "OCCUPIED").length;
  const occupancy = units.length ? Math.round((occupied / units.length) * 100) : 0;

  // Last six months: billed vs collected
  const months: { label: string; due: number; paid: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString("en-US", { month: "short" }), due: 0, paid: 0 });
  }
  for (const p of payments) {
    const idx = 5 - ((now.getFullYear() - p.dueDate.getFullYear()) * 12 + (now.getMonth() - p.dueDate.getMonth()));
    if (idx < 0 || idx > 5) continue;
    months[idx].due += Number(p.amount);
    if (p.status === "PAID") months[idx].paid += Number(p.amount);
  }
  const thisMonth = months[5];
  const rate = thisMonth.due ? Math.round((thisMonth.paid / thisMonth.due) * 100) : 0;
  const maxBar = Math.max(1, ...months.map((m) => m.due));

  // Repair spend by property
  const spend = new Map<string, number>();
  for (const r of repairs) {
    const n = r.unit.property.name;
    spend.set(n, (spend.get(n) ?? 0) + Number(r.actualCost ?? 0));
  }
  const spendRows = [...spend.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSpend = Math.max(1, ...spendRows.map((r) => r[1]));

  const lateRows = lateLeases
    .map((l) => ({
      id: l.id,
      name: l.tenant.name,
      where: `${l.unit.property.name} · ${l.unit.label}`,
      months: l.payments.length,
      owed: l.payments.reduce((s, p) => s + Number(p.amount), 0),
    }))
    .sort((a, b) => b.owed - a.owed)
    .slice(0, 8);
  const canManage = user.role !== "OWNER";

  const cards = [
    { label: "Occupancy", value: `${occupancy}%`, sub: `${occupied} of ${units.length} units` },
    { label: "Collected this month", value: `${rate}%`, sub: `KES ${fmt(thisMonth.paid)} of ${fmt(thisMonth.due)}` },
    { label: "Overdue rent", value: `KES ${fmt(lateRows.reduce((s, r) => s + r.owed, 0))}`, sub: `${lateRows.length} tenants` },
    { label: "Repairs (12 months)", value: `KES ${fmt([...spend.values()].reduce((a, b) => a + b, 0))}`, sub: `${repairs.length} jobs` },
  ];

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl text-ink">Insights</h1>
      <p className="mt-1 text-sm text-muted">How your portfolio is performing.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
            <p className="mt-2 font-serif text-2xl text-ink">{c.value}</p>
            <p className="mt-1 text-xs text-muted">{c.sub}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Rent billed and collected, last 6 months</h2>
        <div className="mt-4 flex h-40 items-end gap-3">
          {months.map((m) => (
            <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end gap-1">
                <div
                  className="w-1/2 rounded-t bg-border"
                  style={{ height: `${(m.due / maxBar) * 100}%` }}
                  title={`Billed KES ${fmt(m.due)}`}
                />
                <div
                  className="w-1/2 rounded-t bg-accent"
                  style={{ height: `${(m.paid / maxBar) * 100}%` }}
                  title={`Collected KES ${fmt(m.paid)}`}
                />
              </div>
              <span className="text-xs text-muted">{m.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-border" /> Billed
          <span className="ml-4 mr-1 inline-block h-2 w-2 rounded-sm bg-accent" /> Collected
        </p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Repair spend by property</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {spendRows.map(([name, total]) => (
              <li key={name}>
                <div className="flex justify-between">
                  <span>{name}</span>
                  <span className="text-muted">KES {fmt(total)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-background">
                  <div className="h-full rounded bg-ink" style={{ width: `${(total / maxSpend) * 100}%` }} />
                </div>
              </li>
            ))}
            {spendRows.length === 0 && <li className="text-muted">No completed repairs yet.</li>}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Who is behind on rent</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {lateRows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted">
                    {r.where} · {r.months} month{r.months === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-danger">KES {fmt(r.owed)}</p>
                  {canManage && (
                    <Link href={`/rent/${r.id}/invoice`} className="text-xs text-accent hover:underline">
                      Invoice
                    </Link>
                  )}
                </div>
              </li>
            ))}
            {lateRows.length === 0 && <li className="py-2 text-muted">Everyone is up to date.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
