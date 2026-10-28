import Link from "next/link";
import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { loadBook } from "@/lib/books";
import { ageBuckets, mriEstimate, percent } from "@/lib/analytics";

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function InsightsPage() {
  const user = await requireUser();
  const scope = ownerScopeFilter(user);
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const in90 = new Date(now.getTime() + 90 * 86_400_000);
  const showMoney = user.can("books.manage");

  const [units, payments, repairs, lateLeases, unpaid, ending, rentYtd, book] = await Promise.all([
    prisma.unit.findMany({
      where: { property: scope },
      select: { status: true, rentAmount: true, property: { select: { id: true, name: true } } },
    }),
    prisma.payment.findMany({
      where: { dueDate: { gte: since, lte: now }, lease: { unit: { property: scope } } },
      select: {
        amount: true,
        dueDate: true,
        status: true,
        lease: { select: { unit: { select: { property: { select: { id: true, name: true } } } } } },
      },
    }),
    prisma.maintenanceRequest.findMany({
      where: { status: "DONE", completedAt: { gte: yearAgo }, unit: { property: scope } },
      select: { actualCost: true, unit: { select: { property: { select: { id: true, name: true } } } } },
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
    prisma.payment.findMany({
      where: { status: { in: ["PENDING", "LATE"] }, dueDate: { lte: now }, lease: { status: "ACTIVE", unit: { property: scope } } },
      select: { amount: true, dueDate: true },
    }),
    prisma.lease.findMany({
      where: { status: "ACTIVE", endDate: { gte: now, lte: in90 }, unit: { property: scope } },
      select: {
        id: true,
        endDate: true,
        rentAmount: true,
        tenant: { select: { name: true } },
        unit: { select: { label: true, property: { select: { name: true } } } },
      },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
    prisma.payment.aggregate({
      where: { status: "PAID", paidDate: { gte: startOfYear, lte: now }, lease: { unit: { property: scope } } },
      _sum: { amount: true },
    }),
    showMoney ? loadBook(user.orgId, since, new Date(now.getFullYear(), now.getMonth() + 1, 1)) : Promise.resolve(null),
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

  // Unpaid rent by age
  const aging = ageBuckets(unpaid.map((p) => ({ dueDate: p.dueDate, amount: Number(p.amount) })), now);
  const agingRows = [
    { label: "Not yet overdue", ...aging.current },
    { label: "1 to 30 days", ...aging.d1to30 },
    { label: "31 to 60 days", ...aging.d31to60 },
    { label: "Over 60 days", ...aging.d61plus },
  ];
  const maxAge = Math.max(1, ...agingRows.map((r) => r.total));

  // Rent lost to empty units
  const vacant = units.filter((u) => u.status === "VACANT");
  const vacancyLoss = vacant.reduce((s, u) => s + Number(u.rentAmount), 0);
  const potentialRent = units.reduce((s, u) => s + Number(u.rentAmount), 0);

  // Per-property performance (last 6 months of billing, 12 months of repairs)
  const perProperty = new Map<string, { name: string; units: number; occupied: number; due: number; paid: number; repairs: number }>();
  const row = (id: string, name: string) => {
    if (!perProperty.has(id)) perProperty.set(id, { name, units: 0, occupied: 0, due: 0, paid: 0, repairs: 0 });
    return perProperty.get(id)!;
  };
  for (const u of units) {
    const r = row(u.property.id, u.property.name);
    r.units++;
    if (u.status === "OCCUPIED") r.occupied++;
  }
  for (const p of payments) {
    const prop = p.lease.unit.property;
    const r = row(prop.id, prop.name);
    r.due += Number(p.amount);
    if (p.status === "PAID") r.paid += Number(p.amount);
  }
  for (const r of repairs) row(r.unit.property.id, r.unit.property.name).repairs += Number(r.actualCost ?? 0);
  const propertyRows = [...perProperty.values()].filter((r) => r.units > 0).sort((a, b) => b.paid - a.paid).slice(0, 12);

  // Money in vs out (needs the books permission)
  const cash: { label: string; inn: number; out: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    cash.push({ label: new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleString("en-US", { month: "short" }), inn: 0, out: 0 });
  }
  for (const l of book ?? []) {
    const idx = 5 - ((now.getFullYear() - l.date.getFullYear()) * 12 + (now.getMonth() - l.date.getMonth()));
    if (idx < 0 || idx > 5) continue;
    if (l.kind === "IN") cash[idx].inn += l.amount;
    else cash[idx].out += l.amount;
  }
  const maxCash = Math.max(1, ...cash.map((c) => Math.max(c.inn, c.out)));
  const cashNet = cash.reduce((s, c) => s + c.inn - c.out, 0);

  const tax = mriEstimate(Number(rentYtd._sum.amount ?? 0));

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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Unpaid rent by age</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {agingRows.map((r) => (
              <li key={r.label}>
                <div className="flex justify-between">
                  <span>
                    {r.label} <span className="text-muted">({r.count})</span>
                  </span>
                  <span className={r.label === "Over 60 days" && r.total > 0 ? "text-danger" : "text-muted"}>KES {fmt(r.total)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-background">
                  <div
                    className={`h-full rounded ${r.label === "Over 60 days" ? "bg-danger" : "bg-ink"}`}
                    style={{ width: `${(r.total / maxAge) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">The older it gets, the less likely it is to be paid. Chase the oldest first.</p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Empty units are costing you</h2>
          <p className="mt-3 font-serif text-2xl text-ink">KES {fmt(vacancyLoss)}</p>
          <p className="text-xs text-muted">
            a month from {vacant.length} vacant unit{vacant.length === 1 ? "" : "s"}
            {potentialRent > 0 && ` (${Math.round((vacancyLoss / potentialRent) * 100)}% of the rent you could be earning)`}
          </p>
          {vacant.length > 0 && canManage && (
            <Link href="/listings" className="mt-3 inline-block text-sm text-accent hover:underline">
              Put them on vacancy pages
            </Link>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Leases ending in the next 90 days</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {ending.map((l) => {
            const days = Math.ceil((l.endDate!.getTime() - now.getTime()) / 86_400_000);
            return (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-foreground">{l.tenant.name}</p>
                  <p className="text-xs text-muted">
                    {l.unit.property.name} · {l.unit.label}
                  </p>
                </div>
                <div className="text-right">
                  <p className={days <= 30 ? "text-danger" : "text-foreground"}>{days} days left</p>
                  <p className="text-xs text-muted">KES {fmt(Number(l.rentAmount))}/month</p>
                </div>
              </li>
            );
          })}
          {ending.length === 0 && <li className="py-2 text-muted">No leases ending soon.</li>}
        </ul>
        {ending.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Talk to these tenants early: a renewal is cheaper than finding a new tenant, and an empty unit costs a full month&apos;s rent.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Property by property</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Property</th>
                <th className="py-2 pr-3">Occupied</th>
                <th className="py-2 pr-3">Collected (6 mo)</th>
                <th className="py-2 pr-3">Collection</th>
                <th className="py-2">Repairs (12 mo)</th>
              </tr>
            </thead>
            <tbody>
              {propertyRows.map((r) => {
                const rate = percent(r.paid, r.due);
                return (
                  <tr key={r.name} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.name}</td>
                    <td className="py-2 pr-3">
                      {r.occupied}/{r.units}
                    </td>
                    <td className="py-2 pr-3">KES {fmt(r.paid)}</td>
                    <td className={`py-2 pr-3 ${rate !== null && rate < 80 ? "text-danger" : ""}`}>{rate === null ? "—" : `${rate}%`}</td>
                    <td className="py-2">KES {fmt(r.repairs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {book && (
        <section className="mt-6 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Money in and out, last 6 months</h2>
          <div className="mt-4 flex h-40 items-end gap-3">
            {cash.map((c) => (
              <div key={c.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end gap-1">
                  <div className="w-1/2 rounded-t bg-accent" style={{ height: `${(c.inn / maxCash) * 100}%` }} title={`In KES ${fmt(c.inn)}`} />
                  <div className="w-1/2 rounded-t bg-ink" style={{ height: `${(c.out / maxCash) * 100}%` }} title={`Out KES ${fmt(c.out)}`} />
                </div>
                <span className="text-xs text-muted">{c.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" /> In
            <span className="ml-4 mr-1 inline-block h-2 w-2 rounded-sm bg-ink" /> Out
            <span className="ml-4">
              Net over 6 months: <strong className={cashNet < 0 ? "text-danger" : "text-ink"}>KES {fmt(cashNet)}</strong>
            </span>
          </p>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Rental income tax estimate</h2>
        <p className="mt-3 text-sm text-foreground">
          Rent collected this year: <strong>KES {fmt(Number(rentYtd._sum.amount ?? 0))}</strong>
        </p>
        <p className="mt-1 text-sm text-foreground">
          Estimated Monthly Rental Income tax so far: <strong>KES {fmt(tax.tax)}</strong>
        </p>
        <p className="mt-1 text-xs text-muted">{tax.note}</p>
        <p className="mt-2 text-xs text-muted">
          An estimate only. Rates and who must pay change, and the tax is the property owner&apos;s own, due by the 20th of the following month. Confirm with KRA or your accountant before you file.
        </p>
      </section>
    </div>
  );
}
