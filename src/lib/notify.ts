/**
 * Central notification service (outbox pattern).
 *
 * `notify()` writes a Notification row for the recipient's preferred channel;
 * `dispatchQueued()` delivers QUEUED rows through whichever provider is
 * configured via env vars. Providers are plain HTTP calls (no extra deps):
 *   EMAIL    -> Resend      (RESEND_API_KEY, NOTIFY_EMAIL_FROM)
 *   SMS      -> Africa's Talking (AT_USERNAME, AT_API_KEY, optional AT_SENDER_ID)
 *   WHATSAPP -> sent from a person's own device: rows stay QUEUED and staff tap
 *               "Send on WhatsApp" on /notifications (wa.me link, see whatsapp.ts)
 * With no provider configured, rows are marked SKIPPED so the log still shows
 * what would have been sent.
 *
 * Only relative imports here: scripts/worker.ts also uses this file.
 */
import type { NotifyChannel, PrismaClient } from "@prisma/client";

export type Recipient = {
  name: string;
  email?: string | null;
  phone?: string | null;
  notifyChannel: NotifyChannel;
};

type Db = Pick<PrismaClient, "notification">;

export async function notify(
  db: Db,
  args: {
    event: string;
    to: Recipient;
    subject: string;
    body: string;
    /** Makes the call idempotent: a second notify() with the same key is a no-op. */
    dedupeKey?: string;
  }
) {
  const { to } = args;
  const channel = to.notifyChannel;
  const address = channel === "EMAIL" ? to.email : to.phone;

  try {
    await db.notification.create({
      data: {
        event: args.event,
        channel,
        recipientName: to.name,
        recipient: address ?? null,
        subject: args.subject,
        body: args.body,
        dedupeKey: args.dedupeKey,
        ...(address ? {} : { status: "SKIPPED", error: `No ${channel === "EMAIL" ? "email" : "phone"} on file` }),
      },
    });
  } catch (e) {
    // Unique violation on dedupeKey = already notified; anything else must not
    // break the business action that triggered the notification.
    if ((e as { code?: string }).code !== "P2002") console.error("[notify] enqueue failed:", e);
  }
}

async function send(channel: NotifyChannel, to: string, subject: string, body: string) {
  if (channel === "EMAIL") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.NOTIFY_EMAIL_FROM;
    if (!key || !from) return "skip" as const;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return "sent" as const;
  }
  if (channel === "SMS") {
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    if (!username || !apiKey) return "skip" as const;
    const host = username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const form = new URLSearchParams({ username, to, message: `${subject}: ${body}` });
    if (process.env.AT_SENDER_ID) form.set("from", process.env.AT_SENDER_ID);
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) throw new Error(`Africa's Talking ${res.status}: ${await res.text()}`);
    return "sent" as const;
  }
  return "skip" as const; // WHATSAPP: not wired up
}

/** Deliver up to `limit` QUEUED notifications. Returns counts. */
export async function dispatchQueued(db: Pick<PrismaClient, "notification">, limit = 100) {
  const rows = await db.notification.findMany({
    where: { status: "QUEUED", channel: { not: "WHATSAPP" } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const counts = { sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    try {
      const result = await send(row.channel, row.recipient!, row.subject, row.body);
      if (result === "sent") {
        await db.notification.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date() } });
        counts.sent++;
      } else {
        await db.notification.update({
          where: { id: row.id },
          data: { status: "SKIPPED", error: `No ${row.channel} provider configured` },
        });
        counts.skipped++;
      }
    } catch (e) {
      await db.notification.update({
        where: { id: row.id },
        data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "Unknown error" },
      });
      counts.failed++;
    }
  }
  return counts;
}
