import { prisma } from "@/lib/prisma";
import { ownerScopeFilter, type AccessUser } from "@/lib/access";
import { parseQuickEntry } from "@/lib/books";
import { whatsappLink } from "@/lib/whatsapp";

/** What a tap on a choice button will do. Re-checked against the database when tapped. */
export type ChatOption =
  | { type: "RENT"; label: string; leaseId: string; paymentId?: string; amount: number; method: "MPESA" | "CASH" | "BANK"; reference?: string }
  | { type: "REPAIR"; label: string; unitId: string; description: string }
  | { type: "EXPENSE"; label: string; kind: "IN" | "OUT"; amount: number; category: string; note: string };

export type ChatLink = { label: string; href: string };
export type ChatData = { options?: ChatOption[]; links?: ChatLink[] };
export type ChatReply = { text: string; data?: ChatData };

const KES = (n: number) => `KES ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export const HELP =
  'Just tell me what happened, I\'ll set it up and ask you to tap Confirm.\n\n' +
  '• "John paid rent 25000 mpesa"\n• "Leak in unit 4B kitchen"\n• "Paid 3500 plumber"  (to your books)\n• "Who owes rent?"\n• "How are we doing this month?"';

type Lease = Awaited<ReturnType<typeof activeLeases>>[number];

function activeLeases(user: AccessUser) {
  return prisma.lease.findMany({
    where: { status: "ACTIVE", unit: { property: ownerScopeFilter(user) } },
    include: { tenant: true, unit: { include: { property: true } } },
  });
}

const leaseName = (l: Lease) => `${l.tenant.name} (${l.unit.property.name} ${l.unit.label})`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Leases whose tenant name or unit label is mentioned in the message, best match first. */
function matchLeases(text: string, leases: Lease[]): Lease[] {
  const t = " " + norm(text) + " ";
  const scored = leases.map((l) => {
    let score = 0;
    const full = norm(l.tenant.name);
    if (full && t.includes(" " + full + " ")) score += 10;
    else for (const w of full.split(" ")) if (w.length >= 3 && t.includes(" " + w + " ")) score += 3;
    const unit = norm(l.unit.label).replace(/^unit /, "");
    if (unit && (t.includes(" " + norm(l.unit.label) + " ") || t.includes(" unit " + unit + " ") || t.includes(" house " + unit + " "))) score += 6;
    return { l, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.l);
}

const RENT_WORDS = /\b(paid|pay|payment|received|sent|rent|mpesa|m-pesa|cash|bank|deposit(?:ed)?)\b/i;
const REPAIR_WORDS = /\b(leak\w*|broken|burst|blocked|repair|fix|not working|no water|no power|faulty|damaged|cracked|clog\w*|stuck|jammed)\b/i;
const OWES_WORDS = /\b(owe|owes|arrears|unpaid|outstanding|late|defaulters?|who hasn'?t paid)\b/i;
const SUMMARY_WORDS = /\b(summary|how (are|am) (we|i)|this month|profit|income|totals?|balance)\b/i;

/** Turn one typed message into a reply, optionally with tap-to-confirm choices. */
export async function interpret(user: AccessUser, textRaw: string): Promise<ChatReply> {
  const text = textRaw.trim();
  const amountMatch = parseQuickEntry(text);

  if (/^(help|hi|hello|hey|\?|menu)$/i.test(text)) return { text: HELP };

  if (OWES_WORDS.test(text) && !amountMatch) {
    if (!user.can("rent.manage")) return { text: "You don't have access to rent." };
    const now = new Date();
    const unpaid = await prisma.payment.findMany({
      where: {
        status: { in: ["PENDING", "LATE"] },
        dueDate: { lte: now },
        lease: { unit: { property: ownerScopeFilter(user) } },
      },
      include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } },
      orderBy: { dueDate: "asc" },
      take: 15,
    });
    if (unpaid.length === 0) return { text: "Everyone is paid up. 🎉" };
    const total = unpaid.reduce((s, p) => s + Number(p.amount), 0);
    const links: ChatLink[] = [];
    for (const p of unpaid) {
      const href = whatsappLink(
        p.lease.tenant.phone,
        `Hello ${p.lease.tenant.name.split(" ")[0]}, a friendly reminder that rent of ${KES(Number(p.amount))} for ${p.lease.unit.property.name} ${p.lease.unit.label} was due on ${p.dueDate.toLocaleDateString("en-GB")}. Thank you.`
      );
      if (href) links.push({ label: `Remind ${p.lease.tenant.name}`, href });
    }
    return {
      text:
        `${unpaid.length} unpaid, ${KES(total)} in total:\n` +
        unpaid.map((p) => `• ${p.lease.tenant.name} · ${p.lease.unit.label} · ${KES(Number(p.amount))}`).join("\n"),
      data: links.length ? { links } : undefined,
    };
  }

  if (SUMMARY_WORDS.test(text) && !amountMatch) {
    if (!user.can("books.manage")) return { text: "You don't have access to the books." };
    const { loadBook } = await import("@/lib/books");
    const n = new Date();
    const lines = await loadBook(user.orgId, new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)), new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)));
    const inn = lines.filter((l) => l.kind === "IN").reduce((s, l) => s + l.amount, 0);
    const out = lines.filter((l) => l.kind === "OUT").reduce((s, l) => s + l.amount, 0);
    return { text: `This month so far:\n• Money in ${KES(inn)}\n• Money out ${KES(out)}\n• ${inn - out >= 0 ? "Profit" : "Loss"} ${KES(Math.abs(inn - out))}`, data: { links: [{ label: "Open books", href: "/books" }] } };
  }

  const leases = await activeLeases(user);
  const matched = matchLeases(text, leases);

  // A repair report: "leak in unit 4B".
  if (REPAIR_WORDS.test(text) && matched.length > 0 && !/\bpaid\b/i.test(text)) {
    if (!user.can("maintenance.manage")) return { text: "You don't have access to log repairs." };
    const units = [...new Map(matched.slice(0, 4).map((l) => [l.unitId, l])).values()];
    return {
      text: units.length === 1 ? "Log this repair?" : "Which unit is it?",
      data: {
        options: units.map((l) => ({
          type: "REPAIR" as const,
          label: `${l.unit.property.name} ${l.unit.label}`,
          unitId: l.unitId,
          description: text,
        })),
      },
    };
  }

  // Rent received: "John paid 25000 mpesa".
  if (amountMatch && matched.length > 0 && RENT_WORDS.test(text) && !REPAIR_WORDS.test(text)) {
    if (!user.can("rent.manage")) return { text: "You don't have access to record rent." };
    const method = /\bcash\b/i.test(text) ? "CASH" : /\bbank|cheque\b/i.test(text) ? "BANK" : "MPESA";
    const ref = text.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10}\b/)?.[0];
    const top = matched.slice(0, 4);
    const options: ChatOption[] = [];
    for (const l of top) {
      const open = await prisma.payment.findFirst({
        where: { leaseId: l.id, status: { in: ["PENDING", "LATE"] } },
        orderBy: { dueDate: "asc" },
      });
      options.push({
        type: "RENT",
        label: `${leaseName(l)} · ${KES(amountMatch.amount)}`,
        leaseId: l.id,
        paymentId: open?.id,
        amount: amountMatch.amount,
        method,
        reference: ref,
      });
    }
    return { text: options.length === 1 ? `Record ${KES(amountMatch.amount)} rent received?` : "Which tenant?", data: { options } };
  }

  // Everything else with an amount is an entry for the books.
  if (amountMatch) {
    if (!user.can("books.manage")) return { text: "I couldn't tell which tenant or unit you meant. Try including their name, or open Collect rent." };
    return {
      text: `${amountMatch.kind === "IN" ? "Money in" : "Money out"}: ${KES(amountMatch.amount)} (${amountMatch.category}). Add to your books?`,
      data: {
        options: [
          { type: "EXPENSE", label: `Add to books · ${amountMatch.category}`, kind: amountMatch.kind, amount: amountMatch.amount, category: amountMatch.category, note: amountMatch.note },
        ],
      },
    };
  }

  return { text: "I didn't catch that.\n\n" + HELP };
}

export async function recentChat(orgId: string, userId: string) {
  const rows = await prisma.chatMessage.findMany({ where: { orgId, userId }, orderBy: { createdAt: "desc" }, take: 60 });
  return rows.reverse();
}
