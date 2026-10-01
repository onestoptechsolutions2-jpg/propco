import Link from "next/link";
import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-danger/10 text-danger",
  ASSIGNED: "bg-ink-light/10 text-ink",
  IN_PROGRESS: "bg-accent-light text-accent",
  DONE: "bg-background text-muted",
  CANCELLED: "bg-background text-muted",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export default async function MaintenancePage() {
  const user = await requireUser();
  const isStaffLike = user.can("maintenance.manage");

  // Owners get a read-only view scoped to their own properties via
  // ownerScopeFilter below; everyone else with no matching scope sees an
  // empty list, same pattern as the other list pages in the app.
  const requests = await prisma.maintenanceRequest.findMany({
    where: { unit: { property: ownerScopeFilter(user) } },
    include: { unit: { include: { property: true } }, supplier: true },
    orderBy: { createdAt: "desc" },
  });

  const openCount = requests.filter((r) => r.status === "OPEN" || r.status === "ASSIGNED").length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Maintenance</h1>
          <p className="mt-1 text-sm text-muted">
            {openCount} open · {requests.length} total
          </p>
        </div>
        {isStaffLike && (
          <Link
            href="/maintenance/new"
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            Log a request
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Property / Unit</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/maintenance/${request.id}`} className="font-medium text-ink hover:underline">
                      {request.unit.property.name} · {request.unit.label}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-foreground">{request.description}</td>
                  <td className="px-4 py-3 text-foreground">{request.supplier?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[request.status]}`}>
                      {STATUS_LABEL[request.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                    No maintenance requests yet.
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
