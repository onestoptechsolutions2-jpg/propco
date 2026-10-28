import { prisma } from "@/lib/prisma";

export type BookLine = {
  id: string;
  date: Date;
  kind: "IN" | "OUT";
  amount: number;
  category: string;
  title: string;
  /** Where the line came from; only MANUAL lines can be deleted here. */
  source: "MANUAL" | "RENT" | "INVOICE" | "PAYROLL" | "PAYOUT";
};

export const IN_CATEGORIES = ["Rent", "Deposit", "Utilities", "Other income"];
export const OUT_CATEGORIES = [
  "Repairs",
  "Supplier invoice",
  "Salaries",
  "Owner payout",
  "Agent commission",
  "Utilities",
  "Cleaning",
  "Security",
  "Transport",
  "Office",
  "Taxes & fees",
  "Other expense",
];

const IN_WORDS = /\b(received|receive|got|collected|earned|income|deposit(?:ed)?|sold|paid me)\b|^\s*\+/i;
const CATEGORY_HINTS: { re: RegExp; category: string }[] = [
  { re: /\b(rent)\b/i, category: "Rent" },
  { re: /\b(deposit)\b/i, category: "Deposit" },
  { re: /\b(water|electric|power|kplc|internet|wifi|token)\b/i, category: "Utilities" },
  { re: /\b(plumb|repair|fix|paint|carpent|electrician|roof|lock)\w*/i, category: "Repairs" },
  { re: /\b(clean|cleaner|soap|garbage|waste)\w*/i, category: "Cleaning" },
  { re: /\b(guard|security|alarm)\w*/i, category: "Security" },
  { re: /\b(fuel|transport|matatu|uber|fare|petrol)\b/i, category: "Transport" },
  { re: /\b(salary|salaries|wage|wages)\b/i, category: "Salaries" },
  { re: /\b(tax|kra|licen[cs]e|permit|levy)\b/i, category: "Taxes & fees" },
  { re: /\b(stationery|printing|airtime|office)\b/i, category: "Office" },
];

/**
 * Turn a chat-style message such as "paid 3,500 plumber unit 4" or
 * "received 25k rent" into a cash-book entry. Returns null when no amount is found.
 */
export function parseQuickEntry(text: string): {
  kind: "IN" | "OUT";
  amount: number;
  category: string;
  note: string;
} | null {
  const t = text.trim();
  const m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i);
  if (!m) return null;
  let amount = parseFloat(m[1].replace(/,/g, ""));
  if (m[2]) amount *= 1000;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const kind: "IN" | "OUT" = IN_WORDS.test(t) ? "IN" : "OUT";
  const hint = CATEGORY_HINTS.find((h) => h.re.test(t))?.category;
  const category = kind === "IN" ? (hint && IN_CATEGORIES.includes(hint) ? hint : "Other income") : hint ?? "Other expense";
  const note = t.replace(m[0], "").replace(/\s+/g, " ").trim();
  return { kind, amount: Math.round(amount * 100) / 100, category, note: note || t };
}

/**
 * Every shilling in or out for a company in [from, to): money the app already
 * tracks (paid rent, paid supplier invoices, paid payroll, paid owner payouts)
 * plus manual entries. Newest first.
 */
export async function loadBook(orgId: string, from: Date, to: Date): Promise<BookLine[]> {
  const range = { gte: from, lt: to };
  const [rent, invoices, slips, payouts, manual] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "PAID", paidDate: range, lease: { unit: { property: { orgId } } } },
      include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } },
    }),
    prisma.supplierInvoice.findMany({
      where: { orgId, status: "PAID", paidAt: range },
      include: { supplier: true },
    }),
    prisma.payslip.findMany({
      where: { paidAt: range, run: { orgId } },
      include: { employee: true },
    }),
    prisma.payout.findMany({
      where: { status: "PAID", paidDate: range, owner: { orgId } },
      include: { owner: true },
    }),
    prisma.ledgerEntry.findMany({ where: { orgId, date: range } }),
  ]);

  const lines: BookLine[] = [
    ...rent.map((p) => ({
      id: "rent-" + p.id,
      date: p.paidDate!,
      kind: "IN" as const,
      amount: Number(p.amount),
      category: "Rent",
      title: `${p.lease.tenant.name} · ${p.lease.unit.property.name} ${p.lease.unit.label}`,
      source: "RENT" as const,
    })),
    ...invoices.map((i) => ({
      id: "inv-" + i.id,
      date: i.paidAt!,
      kind: "OUT" as const,
      amount: Number(i.total),
      category: "Supplier invoice",
      title: `${i.supplier.name} · ${i.description}`,
      source: "INVOICE" as const,
    })),
    ...slips.map((s) => ({
      id: "pay-" + s.id,
      date: s.paidAt!,
      kind: "OUT" as const,
      amount: Number(s.netPay),
      category: "Salaries",
      title: `Salary · ${s.employee.name}`,
      source: "PAYROLL" as const,
    })),
    ...payouts.map((p) => ({
      id: "out-" + p.id,
      date: p.paidDate!,
      kind: "OUT" as const,
      amount: Number(p.netAmount),
      category: "Owner payout",
      title: `Payout · ${p.owner.name}`,
      source: "PAYOUT" as const,
    })),
    ...manual.map((e) => ({
      id: e.id,
      date: e.date,
      kind: e.kind,
      amount: Number(e.amount),
      category: e.category,
      title: e.note || e.category,
      source: "MANUAL" as const,
    })),
  ];
  return lines.sort((a, b) => b.date.getTime() - a.date.getTime());
}
