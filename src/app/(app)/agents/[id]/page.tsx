import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateAgent, payCommission } from "../actions";
import { AgentFields } from "../_form";

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("agents.manage");
  const agent = await prisma.agent.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      leases: {
        include: { tenant: true, unit: { include: { property: true } }, payments: { where: { status: "PAID" }, take: 1, select: { id: true } } },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!agent) notFound();
  const save = updateAgent.bind(null, agent.id);

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">{agent.name}</h1>
      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {agent.leases.map((l) => {
              const amount = Number(l.agentCommission ?? 0);
              const ready = l.payments.length > 0;
              return (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">{l.tenant.name}<div className="text-xs text-muted">{l.unit.property.name} · {l.unit.label}</div></td>
                  <td className="px-4 py-3">{kes(amount)}</td>
                  <td className="px-4 py-3">
                    {l.agentCommissionPaidAt ? (
                      <span className="text-accent">Paid {l.agentCommissionPaidAt.toLocaleDateString()}</span>
                    ) : !ready ? (
                      <span className="text-muted">Waiting for first rent</span>
                    ) : (
                      <form action={payCommission} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="leaseId" value={l.id} />
                        <select name="method" className="rounded border border-border px-2 py-1 text-xs"><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option><option value="CASH">Cash</option></select>
                        <input name="ref" placeholder="Reference" className="w-28 rounded border border-border px-2 py-1 text-xs" />
                        <button className="rounded bg-ink px-3 py-1 text-xs font-medium text-white">Mark paid</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {agent.leases.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted">No tenants yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 font-serif text-lg text-ink">Terms</h2>
      <form action={save} className="mt-3 flex flex-col gap-4">
        <AgentFields agent={agent} />
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save changes</button>
      </form>
    </div>
  );
}
