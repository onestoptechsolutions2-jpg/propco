import Link from "next/link";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

const STATUS_STYLES: Record<string, string> = {
  Paid: "bg-accent-light text-accent",
  Late: "bg-danger/10 text-danger",
  Due: "bg-ink-light/10 text-ink",
  "Not recorded": "bg-background text-muted",
};

export default async function RentRollPage() {
  const user = await requirePermission("rent.manage");
  const { start, end } = monthRange();

  const leases = await prisma.lease.findMany({
    where: {
      status: "ACTIVE",
      unit: { property: ownerScopeFilter(user) },
    },
    include: {
      tenant: true,
      unit: { include: { property: { include: { owner: true } } } },
      payments: {
        where: { dueDate: { gte: start, lte: end } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { unit: { property: { name: "asc" } } },
  });

  const today = new Date();
  const collected = leases.filter((l) => l.payments[0]?.status === "PAID").length;

  return (
    <div>
      <div>
        <Link
          href="/rent/confirm"
          className="float-right rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light"
        >
          Confirm M-Pesa payments
        </Link>
        <h1 className="font-serif text-3xl text-ink">Rent roll</h1>
        <p className="mt-1 text-sm text-muted">
          {today.toLocaleString("en-US", { month: "long", year: "numeric" })} · {collected}/
          {leases.length} collected
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Property / Unit</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Rent (KES)</th>
                <th className="px-4 py-3">This month</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leases.map((lease) => {
                const payment = lease.payments[0];
                let label = "Not recorded";
                if (payment?.status === "PAID") label = "Paid";
                else if (payment && payment.dueDate < today) label = "Late";
                else if (payment) label = "Due";

                return (
                  <tr key={lease.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link
                        href={`/properties/${lease.unit.property.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {lease.unit.property.name} · {lease.unit.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{lease.tenant.name}</td>
                    <td className="px-4 py-3 text-foreground">
                      {Number(lease.rentAmount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[label]}`}>
                        {label}
                        {label === "Due" && payment
                          ? ` ${payment.dueDate.toLocaleDateString()}`
                          : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/rent/${lease.id}`} className="text-accent hover:underline">
                        View / record
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {leases.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                    No active leases yet.
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
