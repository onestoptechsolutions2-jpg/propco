import Link from "next/link";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { whatsappLink } from "@/lib/whatsapp";
import { UpgradeCard } from "@/components/UpgradeCard";
import { deactivateMeter, markBillPaid } from "./actions";

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_LABEL: Record<string, string> = {
  WATER: "Water",
  ELECTRICITY: "Electricity",
  INTERNET: "Internet",
  GAS: "Gas",
  OTHER: "Other",
};

export default async function UtilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ recorded?: string }>;
}) {
  const user = await requirePermission("utilities.manage");
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Utilities billing" isAdmin={user.can("billing.manage")} />;
  }
  const { recorded } = await searchParams;
  const scope = ownerScopeFilter(user);

  const [properties, bills, alerts] = await Promise.all([
    prisma.property.findMany({
      where: scope,
      orderBy: { name: "asc" },
      include: {
        units: {
          orderBy: { label: "asc" },
          include: {
            meters: {
              where: { active: true },
              include: { readings: { orderBy: [{ readingDate: "desc" }, { createdAt: "desc" }], take: 1 } },
            },
          },
        },
      },
    }),
    prisma.meterReading.findMany({
      where: { status: "UNPAID", amount: { gt: 0 }, meter: { unit: { property: scope } } },
      include: {
        meter: { include: { unit: { include: { property: true } } } },
        lease: { include: { tenant: true } },
      },
      orderBy: { readingDate: "asc" },
    }),
    prisma.meterReading.findMany({
      where: {
        alert: { not: null },
        readingDate: { gte: new Date(new Date().getTime() - 60 * 86_400_000) },
        meter: { unit: { property: scope } },
      },
      include: { meter: { include: { unit: { include: { property: true } } } }, lease: { include: { tenant: true } } },
      orderBy: { readingDate: "desc" },
      take: 20,
    }),
  ]);

  const owed = bills.reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-ink">Utilities</h1>
          <p className="mt-1 text-sm text-muted">
            Water, electricity, internet and more. Record readings and bill tenants.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/utilities/meters/new"
            className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink"
          >
            Add a meter
          </Link>
          <Link
            href="/utilities/readings"
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light"
          >
            Record readings
          </Link>
        </div>
      </div>

      {recorded && (
        <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">
          Readings saved. {Number(recorded)} bill{Number(recorded) === 1 ? "" : "s"} created and tenants notified.
        </p>
      )}

      {alerts.length > 0 && (
        <div className="mt-6 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <h2 className="font-serif text-lg text-danger">Unusual usage ({alerts.length})</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {alerts.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-foreground">
                  {a.meter.unit.property.name} · {a.meter.unit.label} · {TYPE_LABEL[a.meter.type]}
                </span>
                <span className="text-muted"> ({a.readingDate.toISOString().slice(0, 10)}): </span>
                {a.alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-8 font-serif text-xl text-ink">
        Unpaid bills <span className="text-base text-muted">· KES {fmt(owed)}</span>
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3 text-right">KES</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const wa = whatsappLink(
                  b.lease?.tenant.phone,
                  `Hello ${b.lease?.tenant.name}, your ${TYPE_LABEL[b.meter.type].toLowerCase()} bill for ${b.meter.unit.label} is KES ${fmt(b.amount)}. Please pay when you can. Thank you.`
                );
                return (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-4 py-3">{b.lease?.tenant.name ?? <span className="text-muted">Vacant</span>}</td>
                    <td className="px-4 py-3 text-muted">
                      {b.meter.unit.property.name} · {b.meter.unit.label}
                    </td>
                    <td className="px-4 py-3">
                      {TYPE_LABEL[b.meter.type]}
                      <p className="text-xs text-muted">{b.readingDate.toISOString().slice(0, 10)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{fmt(b.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener" className="mr-3 text-xs text-accent hover:underline">
                          Remind on WhatsApp
                        </a>
                      )}
                      <form action={markBillPaid.bind(null, b.id)} className="inline">
                        <button className="text-xs font-medium text-accent hover:underline">Mark paid</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {bills.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                    No unpaid utility bills.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="mt-10 font-serif text-xl text-ink">Meters</h2>
      {properties.every((p) => p.units.every((u) => u.meters.length === 0)) ? (
        <p className="mt-3 text-sm text-muted">
          No meters yet. Press “Add a meter” to set up water, electricity or internet for a unit.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {properties.map((p) => {
            const units = p.units.filter((u) => u.meters.length > 0);
            if (units.length === 0) return null;
            return (
              <div key={p.id} className="rounded-lg border border-border bg-surface p-4">
                <p className="font-medium text-foreground">{p.name}</p>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {units.flatMap((u) =>
                    u.meters.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          {u.label} · {TYPE_LABEL[m.type]}
                          {m.label ? ` (${m.label})` : ""}
                        </span>
                        <span className="text-xs text-muted">
                          {m.mode === "FIXED"
                            ? `KES ${fmt(m.rate)} per month`
                            : `KES ${fmt(m.rate)} per ${m.unitName} · last reading ${m.readings[0] ? Number(m.readings[0].reading) : "none"}`}
                        </span>
                        <form action={deactivateMeter.bind(null, m.id)}>
                          <button className="text-xs text-danger hover:underline">Remove</button>
                        </form>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
