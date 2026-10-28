import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { SOURCE_LABELS, commissionsDue } from "@/lib/agents";

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

export default async function AgentsPage() {
  const user = await requirePermission("agents.manage");
  const [agents, due, sources] = await Promise.all([
    prisma.agent.findMany({
      where: { orgId: user.orgId },
      include: { leases: { select: { agentCommission: true, agentCommissionPaidAt: true } } },
      orderBy: { name: "asc" },
    }),
    commissionsDue(user.orgId),
    prisma.lease.groupBy({
      by: ["source"],
      where: { source: { not: null }, unit: { property: { orgId: user.orgId } } },
      _count: true,
    }),
  ]);
  const dueTotal = due.reduce((s, l) => s + Number(l.agentCommission ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Agents</h1>
          <p className="mt-1 text-sm text-muted">People who bring you tenants, and what you owe them.</p>
        </div>
        <Link href="/agents/new" className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">Add agent</Link>
      </div>

      {due.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Commissions to pay · {kes(dueTotal)}</h2>
          <p className="text-xs text-muted">The tenant has paid their first rent, so these are now due.</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {due.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/agents/${l.agentId}`} className="font-medium text-ink hover:underline">{l.agent!.name}</Link>
                  <span className="text-muted"> · {l.tenant.name}, {l.unit.property.name} {l.unit.label}</span>
                </span>
                <span className="font-medium">{kes(Number(l.agentCommission))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Tenants brought</th><th className="px-4 py-3">Earned</th><th className="px-4 py-3">Owed</th></tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const earned = a.leases.filter((l) => l.agentCommissionPaidAt).reduce((s, l) => s + Number(l.agentCommission ?? 0), 0);
                const owed = a.leases.filter((l) => !l.agentCommissionPaidAt).reduce((s, l) => s + Number(l.agentCommission ?? 0), 0);
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-3"><Link href={`/agents/${a.id}`} className="font-medium text-ink hover:underline">{a.name}</Link>{!a.active && <span className="ml-2 text-xs text-muted">inactive</span>}</td>
                    <td className="px-4 py-3">{a.leases.length}</td>
                    <td className="px-4 py-3">{kes(earned)}</td>
                    <td className="px-4 py-3">{kes(owed)}</td>
                  </tr>
                );
              })}
              {agents.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">No agents yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Where tenants come from</h2>
          <ul className="mt-2 text-sm">
            {sources.sort((a, b) => b._count - a._count).map((s) => (
              <li key={s.source} className="flex justify-between py-1"><span>{SOURCE_LABELS[s.source!]}</span><span className="text-muted">{s._count}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
