import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PLANS, isPlatformAdmin, orgStatus } from "@/lib/plans";
import type { Plan } from "@prisma/client";

async function activate(orgId: string, formData: FormData) {
  "use server";
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) throw new Error("Not allowed.");

  const plan = String(formData.get("plan")) as Plan;
  const months = Math.min(24, Math.max(1, Number(formData.get("months")) || 1));
  if (!(plan in PLANS)) throw new Error("Unknown plan.");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const base = org.paidUntil && org.paidUntil > new Date() ? org.paidUntil : new Date();
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan,
      paidUntil: plan === "FREE" ? null : new Date(base.getTime() + months * 30 * 86_400_000),
      billingNote: `${PLANS[plan].label} activated for ${months} month(s) on ${new Date().toISOString().slice(0, 10)}`,
    },
  });
  revalidatePath("/platform");
}

async function extendTrial(orgId: string) {
  "use server";
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) throw new Error("Not allowed.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const base = org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
  await prisma.organization.update({
    where: { id: orgId },
    data: { trialEndsAt: new Date(base.getTime() + 14 * 86_400_000) },
  });
  revalidatePath("/platform");
}

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();

  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "all";
  const selectedStatus = ["all", "trial", "paying", "lapsed", "free"].includes(requestedStatus)
    ? requestedStatus
    : "all";

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, properties: true } } },
  });
  const unitCounts = await prisma.unit.groupBy({ by: ["propertyId"], _count: true });
  const propertyOrg = await prisma.property.findMany({ select: { id: true, orgId: true } });
  const orgOfProperty = new Map(propertyOrg.map((p) => [p.id, p.orgId]));
  const unitsByOrg = new Map<string, number>();
  for (const row of unitCounts) {
    const o = orgOfProperty.get(row.propertyId);
    if (o) unitsByOrg.set(o, (unitsByOrg.get(o) ?? 0) + row._count);
  }

  const now = new Date();
  const mrr = orgs.reduce((sum, o) => (orgStatus(o, now).subscribed ? sum + PLANS[o.plan].priceKes : sum), 0);
  const paying = orgs.filter((o) => orgStatus(o, now).subscribed).length;
  const trials = orgs.filter((o) => orgStatus(o, now).inTrial).length;
  const filteredOrgs = orgs.filter((org) => {
    const status = orgStatus(org, now);
    const matchesQuery = !query || org.name.toLowerCase().includes(query) || org.id.toLowerCase().includes(query);
    const matchesStatus =
      selectedStatus === "all" ||
      (selectedStatus === "trial" && status.inTrial) ||
      (selectedStatus === "paying" && !status.inTrial && status.subscribed) ||
      (selectedStatus === "lapsed" && status.lapsed) ||
      (selectedStatus === "free" && !status.inTrial && !status.subscribed && !status.lapsed);
    return matchesQuery && matchesStatus;
  });

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">SaaS clients</h1>
      <p className="mt-1 text-sm text-muted">Client organizations, subscriptions and trials.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Companies", orgs.length],
          ["On trial", trials],
          ["Paying", paying],
          ["Monthly revenue (KES)", mrr.toLocaleString()],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
          </div>
        ))}
      </div>

      <form action="/platform" method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-xs font-medium text-muted">
          Search clients
          <input
            type="search"
            name="q"
            defaultValue={typeof params.q === "string" ? params.q : ""}
            placeholder="Company name or ID"
            className="mt-1.5 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted">
          Subscription status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-1.5 block min-w-40 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="trial">On trial</option>
            <option value="paying">Paying</option>
            <option value="lapsed">Lapsed</option>
            <option value="free">Free</option>
          </select>
        </label>
        <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">Filter</button>
      </form>

      <p className="mb-2 mt-4 text-xs text-muted">Showing {filteredOrgs.length} of {orgs.length} clients</p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Activate plan</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.map((o) => {
                const st = orgStatus(o, now);
                return (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{o.name}</p>
                      <p className="font-mono text-xs text-muted">{o.id.slice(-8).toUpperCase()}</p>
                      {o.billingNote && <p className="mt-1 text-xs text-muted">{o.billingNote}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {unitsByOrg.get(o.id) ?? 0} units · {o._count.properties} properties · {o._count.users} users
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {st.inTrial
                        ? `Trial, ${st.trialDaysLeft}d left`
                        : st.subscribed
                          ? `${PLANS[o.plan].label} until ${o.paidUntil?.toLocaleDateString()}`
                          : st.lapsed
                            ? "Lapsed"
                            : "Free"}
                    </td>
                    <td className="px-4 py-3">
                      <form action={activate.bind(null, o.id)} className="flex flex-wrap items-center gap-2">
                        <select
                          name="plan"
                          defaultValue={o.plan === "FREE" ? "GROWTH" : o.plan}
                          className="rounded border border-border px-2 py-1.5 text-xs"
                        >
                          {(Object.keys(PLANS) as Plan[]).map((k) => (
                            <option key={k} value={k}>
                              {PLANS[k].label}
                            </option>
                          ))}
                        </select>
                        <input
                          name="months"
                          type="number"
                          min={1}
                          max={24}
                          defaultValue={1}
                          className="w-16 rounded border border-border px-2 py-1.5 text-xs"
                        />
                        <span className="text-xs text-muted">month(s)</span>
                        <button className="text-xs font-medium text-accent hover:underline">Activate</button>
                      </form>
                      <form action={extendTrial.bind(null, o.id)} className="mt-1">
                        <button className="text-xs text-muted hover:underline">+14 days trial</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {filteredOrgs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                    No clients match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
