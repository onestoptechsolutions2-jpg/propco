import Link from "next/link";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { UpgradeCard } from "@/components/UpgradeCard";

export default async function LeasesPage() {
  const user = await requireRole("STAFF", "LANDLORD");
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Move-in and move-out" isAdmin={user.role === "ADMIN"} />;
  }

  const scope = { unit: { property: ownerScopeFilter(user) } };
  const [active, ended] = await Promise.all([
    prisma.lease.findMany({
      where: { status: "ACTIVE", ...scope },
      include: { tenant: true, unit: { include: { property: true } }, checklists: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.lease.findMany({
      where: { status: "ENDED", ...scope },
      include: { tenant: true, unit: { include: { property: true } } },
      orderBy: { endDate: "desc" },
      take: 20,
    }),
  ]);

  const badge = (done: boolean, started: boolean, label: string) => (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        done ? "bg-accent-light text-accent" : started ? "bg-ink-light/10 text-ink" : "bg-background text-muted"
      }`}
    >
      {label}: {done ? "done" : started ? "in progress" : "not started"}
    </span>
  );

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">Move in and move out</h1>
      <p className="mt-1 text-sm text-muted">
        Onboard a new tenant with a checklist, and clear a unit properly when they leave.
      </p>

      <h2 className="mt-8 font-serif text-xl text-ink">Current tenants</h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
        <ul className="divide-y divide-border">
          {active.map((l) => {
            const inList = l.checklists.find((c) => c.type === "MOVE_IN");
            const outList = l.checklists.find((c) => c.type === "MOVE_OUT");
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{l.tenant.name}</p>
                  <p className="text-xs text-muted">
                    {l.unit.property.name} · {l.unit.label}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {badge(!!inList?.completedAt, !!inList, "Move in")}
                  {outList && badge(false, true, "Move out")}
                  <Link href={`/leases/${l.id}`} className="text-xs font-medium text-accent hover:underline">
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
          {active.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">
              No current tenants. Add a tenant and move them into a unit first.
            </li>
          )}
        </ul>
      </div>

      {ended.length > 0 && (
        <>
          <h2 className="mt-8 font-serif text-xl text-ink">Recently moved out</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
            <ul className="divide-y divide-border">
              {ended.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{l.tenant.name}</p>
                    <p className="text-xs text-muted">
                      {l.unit.property.name} · {l.unit.label} · left {l.endDate?.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <Link
                    href={`/leases/${l.id}/clearance`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Clearance certificate
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
