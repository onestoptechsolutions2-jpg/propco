import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const badge: Record<string, string> = {
  SENT: "bg-accent-light text-accent",
  QUEUED: "bg-ink-light/10 text-ink",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-background text-muted",
};

export default async function NotificationsPage() {
  await requireRole("STAFF");
  const rows = await prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">Notifications</h1>
      <p className="mt-1 text-sm text-muted">
        Last 200 messages. Delivered every minute by the worker; rows show <strong>Skipped</strong> until an
        email (Resend) or SMS (Africa&apos;s Talking) provider is configured in the environment.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 text-xs text-muted">{n.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs">{n.event}</td>
                  <td className="px-4 py-3">
                    {n.recipientName}
                    <p className="text-xs text-muted">
                      {n.channel}
                      {n.recipient ? ` · ${n.recipient}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{n.subject}</p>
                    <p className="text-xs text-muted">{n.body}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${badge[n.status]}`}>
                      {n.status[0] + n.status.slice(1).toLowerCase()}
                    </span>
                    {n.error && <p className="mt-1 text-xs text-muted">{n.error}</p>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                    No notifications yet.
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
