import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { whatsappLink } from "@/lib/whatsapp";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { markNotificationSent } from "./actions";

const badge: Record<string, string> = {
  SENT: "bg-accent-light text-accent",
  QUEUED: "bg-ink-light/10 text-ink",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-background text-muted",
};

export default async function NotificationsPage() {
  const user = await requirePermission("messages.manage");
  const rows = await prisma.notification.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" }, take: 200 });
  const toSend = rows.filter((n) => n.channel === "WHATSAPP" && n.status === "QUEUED");

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">Notifications</h1>
      <p className="mt-1 text-sm text-muted">
        Last 200 messages. Email and SMS are delivered automatically every minute once a provider is set up (otherwise
        they show <strong>Skipped</strong>). WhatsApp messages wait for you above.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">
          WhatsApp messages to send {toSend.length > 0 && `(${toSend.length})`}
        </h2>
        <p className="mt-1 text-xs text-muted">
          These go out from <strong>this device&apos;s WhatsApp</strong>. Tap the button, WhatsApp opens with
          the message ready, then press Send there.
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {toSend.map((n) => {
            const href = whatsappLink(n.recipient, `${n.subject}

${n.body}`);
            return (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{n.recipientName}</p>
                  <p className="text-xs text-muted">{n.subject}</p>
                </div>
                {href ? (
                  <WhatsAppButton href={href} markSent={markNotificationSent.bind(null, n.id)} />
                ) : (
                  <span className="text-xs text-muted">Phone number looks invalid — fix it on their page</span>
                )}
              </li>
            );
          })}
          {toSend.length === 0 && <li className="text-sm text-muted">Nothing waiting. You&apos;re all caught up.</li>}
        </ul>
      </div>

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
