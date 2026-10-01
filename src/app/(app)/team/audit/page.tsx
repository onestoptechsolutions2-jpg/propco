import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { TeamTabs } from "@/components/TeamTabs";

const LABEL: Record<string, string> = {
  "user.created": "Added a team member",
  "user.role_changed": "Changed a role",
  "user.suspended": "Suspended a team member",
  "user.reactivated": "Restored a team member",
  "user.password_reset": "Reset a password",
  "user.removed": "Removed a team member",
  "role.created": "Created a role",
  "role.updated": "Edited a role",
  "role.deleted": "Deleted a role",
  "company.updated": "Updated company details",
  "login.locked": "Account locked after wrong passwords",
  "password.changed": "Changed their own password",
  "payroll.approved": "Approved a payroll run",
  "payroll.paid": "Paid a payslip",
  "payout.paid": "Marked an owner payout paid",
  "invoice.approved": "Approved a supplier invoice",
  "invoice.paid": "Paid a supplier invoice",
};

export default async function AuditPage() {
  const user = await requirePermission("team.manage");
  const rows = await prisma.auditLog.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Team and access</h1>
      <TeamTabs active="activity" />
      <p className="mt-4 text-sm text-muted">Who changed people, roles and money, and when. The latest 200 events.</p>

      <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {r.actorName} <span className="font-normal text-muted">· {LABEL[r.action] ?? r.action}</span>
              </p>
              {r.detail && <p className="break-words text-xs text-muted">{r.detail}</p>}
            </div>
            <span className="text-xs text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-6 text-center text-muted">Nothing recorded yet.</li>}
      </ul>
    </div>
  );
}
