import { prisma } from "@/lib/prisma";
import { ownerScopeFilter, type AccessUser } from "@/lib/access";
import { ageBuckets, type AgeBuckets } from "@/lib/analytics";
import { orgStatus } from "@/lib/plans";
import { whatsappLink } from "@/lib/whatsapp";

const DAY = 86_400_000;
const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;

export type Tone = "ok" | "warn" | "bad" | "info";
export type FeedAction =
  | { kind: "link"; label: string; href: string; primary?: boolean; external?: boolean }
  | { kind: "approveInvoice"; label: string; id: string };
export type FeedItem = {
  id: string;
  tone: Tone;
  icon: "cash" | "clock" | "doc" | "key" | "tool" | "chat" | "wallet" | "card";
  title: string;
  detail: string;
  actions: FeedAction[];
  /** Lower comes first. */
  priority: number;
};

/** M-Pesa messages shout names in capitals; show them like a person would write them. */
const nice = (s: string) => s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());

const names = (xs: string[], n = 3) => {
  const shown = xs.slice(0, n).join(", ");
  return xs.length > n ? `${shown} and ${xs.length - n} more` : shown;
};

/**
 * Everything that is waiting for this person, most urgent first. Each item is only built when
 * they hold the permission to act on it, so a manager, an accountant and a caretaker each get
 * their own list from the same code.
 */
export async function buildFeed(user: AccessUser, now = new Date()): Promise<FeedItem[]> {
  const scope = ownerScopeFilter(user);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items: FeedItem[] = [];
  const can = user.can;
  const jobs: Promise<void>[] = [];

  if (can("rent.manage")) {
    jobs.push(
      (async () => {
        const [proofs, overdue] = await Promise.all([
          prisma.paymentProof.findMany({ where: { orgId: user.orgId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 20 }),
          prisma.payment.findMany({
            where: { status: { in: ["PENDING", "LATE"] }, dueDate: { lt: startOfToday }, lease: { status: "ACTIVE", unit: { property: scope } } },
            include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } },
            orderBy: { dueDate: "asc" },
            take: 200,
          }),
        ]);
        if (proofs.length) {
          items.push({
            id: "proofs", tone: "info", icon: "cash", priority: 20,
            title: `${proofs.length} M-Pesa message${proofs.length === 1 ? "" : "s"} waiting for you`,
            detail: names(proofs.map((p) => `${p.payerName ? nice(p.payerName) : "Unknown payer"} ${p.amount ? fmt(Number(p.amount)) : ""}`.trim())),
            actions: [{ kind: "link", label: "Review and approve", href: "/rent/confirm", primary: true }],
          });
        }
        if (overdue.length) {
          const total = overdue.reduce((s, p) => s + Number(p.amount), 0);
          const oldest = overdue[0];
          const days = Math.max(1, Math.round((startOfToday.getTime() - oldest.dueDate.getTime()) / DAY));
          const reminders = overdue.slice(0, 3).flatMap((p) => {
            const href = whatsappLink(
              p.lease.tenant.phone,
              `Hello ${p.lease.tenant.name.split(" ")[0]}, a friendly reminder that rent of ${fmt(Number(p.amount))} for ${p.lease.unit.property.name} ${p.lease.unit.label} was due on ${p.dueDate.toLocaleDateString("en-GB")}. Thank you.`
            );
            return href ? [{ kind: "link" as const, label: `Remind ${p.lease.tenant.name.split(" ")[0]}`, href, external: true }] : [];
          });
          items.push({
            id: "late", tone: days > 30 ? "bad" : "warn", icon: "clock", priority: 10,
            title: `${overdue.length} unpaid rent payment${overdue.length === 1 ? "" : "s"}`,
            detail: `${fmt(total)} in total. The oldest is ${oldest.lease.tenant.name}, ${days} day${days === 1 ? "" : "s"} late.`,
            actions: [...reminders, { kind: "link", label: "See everyone", href: "/rent" }],
          });
        }
      })()
    );
  }

  if (can("invoices.manage")) {
    jobs.push(
      (async () => {
        const where = { orgId: user.orgId, ...(user.role === "LANDLORD" ? { request: { unit: { property: scope } } } : {}) };
        const [submitted, approved, org] = await Promise.all([
          prisma.supplierInvoice.findMany({ where: { ...where, status: "SUBMITTED" }, include: { supplier: true }, orderBy: { createdAt: "asc" }, take: 10 }),
          prisma.supplierInvoice.count({ where: { ...where, status: "APPROVED" } }),
          prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } }),
        ]);
        const limit = org.approvalLimit ? Number(org.approvalLimit) : null;
        submitted.slice(0, 3).forEach((inv, i) => {
          const tooBig = limit !== null && Number(inv.total) > limit && !can("invoices.approve_large");
          items.push({
            id: `inv-${inv.id}`, tone: "warn", icon: "doc", priority: 30 + i,
            title: `${inv.supplier.name} sent an invoice`,
            detail: `${fmt(Number(inv.total))} for ${inv.description}.${tooBig ? ` Above your ${fmt(limit!)} limit, so an admin approves it.` : ""}`,
            actions: [
              tooBig ? { kind: "link", label: "Open invoices", href: "/invoices", primary: true } : { kind: "approveInvoice", label: "Approve", id: inv.id },
              ...(tooBig ? [] : [{ kind: "link" as const, label: "Open", href: "/invoices" }]),
            ],
          });
        });
        if (submitted.length > 3) {
          items.push({ id: "inv-more", tone: "warn", icon: "doc", priority: 34, title: `${submitted.length - 3} more invoices to approve`, detail: "They are waiting under Supplier invoices.", actions: [{ kind: "link", label: "Open invoices", href: "/invoices", primary: true }] });
        }
        if (approved > 0) {
          items.push({ id: "inv-pay", tone: "info", icon: "doc", priority: 40, title: `${approved} approved invoice${approved === 1 ? "" : "s"} to pay`, detail: "Send the money, then mark each one paid so it cannot be paid twice.", actions: [{ kind: "link", label: "Pay invoices", href: "/invoices?status=APPROVED", primary: true }] });
        }
      })()
    );
  }

  if (can("payouts.manage")) {
    jobs.push(
      (async () => {
        const pending = await prisma.payout.findMany({ where: { status: "PENDING", owner: { orgId: user.orgId } }, include: { owner: true } });
        if (pending.length) {
          const total = pending.reduce((s, p) => s + Number(p.netAmount), 0);
          items.push({
            id: "payouts", tone: "ok", icon: "wallet", priority: 35,
            title: `${pending.length} owner payout${pending.length === 1 ? "" : "s"} to send`,
            detail: `${fmt(total)} after commission and repairs: ${names(pending.map((p) => p.owner.name))}.`,
            actions: [{ kind: "link", label: "Review payouts", href: "/payouts", primary: true }],
          });
        } else if (now.getDate() >= 1) {
          // Nothing pending: has last month's rent been turned into payouts yet?
          const from = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
          const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0, 23, 59, 59));
          const [rent, made] = await Promise.all([
            prisma.payment.count({ where: { status: "PAID", dueDate: { gte: from, lte: to }, lease: { unit: { property: { orgId: user.orgId, managementMode: "AGENCY_MANAGED" } } } } }),
            prisma.payout.count({ where: { periodStart: from, owner: { orgId: user.orgId } } }),
          ]);
          if (rent > 0 && made === 0) {
            const label = from.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
            items.push({ id: "payouts-gen", tone: "info", icon: "wallet", priority: 36, title: `${label}'s owner payouts are not made yet`, detail: `${rent} rent payments were collected in ${label}. Generate the payouts to see what each owner is owed.`, actions: [{ kind: "link", label: "Generate payouts", href: `/payouts?month=${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`, primary: true }] });
          }
        }
      })()
    );
  }

  if (can("leases.manage") || can("tenants.manage")) {
    jobs.push(
      (async () => {
        const ending = await prisma.lease.findMany({
          where: { status: "ACTIVE", endDate: { gte: now, lte: new Date(now.getTime() + 45 * DAY) }, unit: { property: scope } },
          include: { tenant: true, unit: { include: { property: true } } },
          orderBy: { endDate: "asc" },
          take: 3,
        });
        ending.forEach((l, i) => {
          const days = Math.ceil((l.endDate!.getTime() - now.getTime()) / DAY);
          items.push({
            id: `lease-${l.id}`, tone: "info", icon: "key", priority: 50 + i,
            title: `${l.tenant.name}'s lease ends in ${days} day${days === 1 ? "" : "s"}`,
            detail: `${l.unit.property.name} ${l.unit.label} · ${fmt(Number(l.rentAmount))} a month. A renewal costs less than an empty month.`,
            actions: [{ kind: "link", label: "Open tenant", href: `/tenants/${l.tenantId}/edit`, primary: true }],
          });
        });
      })()
    );
  }

  if (can("maintenance.manage")) {
    jobs.push(
      (async () => {
        const [open, overdue] = await Promise.all([
          prisma.maintenanceRequest.findMany({ where: { status: "OPEN", supplierId: null, unit: { property: scope } }, include: { unit: { include: { property: true } } }, orderBy: { createdAt: "asc" }, take: 10 }),
          prisma.maintenanceSchedule.findMany({ where: { active: true, nextDue: { lt: now }, property: scope }, take: 10 }),
        ]);
        if (open.length) {
          items.push({
            id: "repairs", tone: "warn", icon: "tool", priority: 45,
            title: `${open.length} repair${open.length === 1 ? " needs" : "s need"} a supplier`,
            detail: names(open.map((r) => `${r.description} (${r.unit.property.name} ${r.unit.label})`), 2),
            actions: [{ kind: "link", label: "Assign a supplier", href: "/maintenance", primary: true }],
          });
        }
        if (overdue.length) {
          items.push({ id: "preventive", tone: "warn", icon: "tool", priority: 46, title: `${overdue.length} preventive job${overdue.length === 1 ? " is" : "s are"} overdue`, detail: names(overdue.map((s) => s.title)), actions: [{ kind: "link", label: "Open the calendar", href: "/maintenance/schedule", primary: true }] });
        }
      })()
    );
  }

  if (can("messages.manage")) {
    jobs.push(
      (async () => {
        const n = await prisma.notification.count({ where: { orgId: user.orgId, channel: "WHATSAPP", status: "QUEUED" } });
        if (n) items.push({ id: "whatsapp", tone: "info", icon: "chat", priority: 55, title: `${n} WhatsApp message${n === 1 ? "" : "s"} to send`, detail: "Reminders and receipts are written and waiting. Tap each to open WhatsApp.", actions: [{ kind: "link", label: "Send them", href: "/notifications", primary: true }] });
      })()
    );
  }

  if (can("billing.manage")) {
    jobs.push(
      (async () => {
        const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
        const st = orgStatus(org, now);
        if (st.inTrial && st.trialDaysLeft <= 3) items.push({ id: "plan", tone: "warn", icon: "card", priority: 15, title: `Your free trial ends in ${st.trialDaysLeft} day${st.trialDaysLeft === 1 ? "" : "s"}`, detail: "Choose a plan to keep utilities, move-in and out, and payroll.", actions: [{ kind: "link", label: "Choose a plan", href: "/billing", primary: true }] });
        else if (st.subscribed && org.paidUntil && org.paidUntil.getTime() - now.getTime() <= 5 * DAY) items.push({ id: "plan", tone: "warn", icon: "card", priority: 15, title: "Your plan ends soon", detail: `It runs until ${org.paidUntil.toLocaleDateString("en-GB")}. Renew to avoid dropping to the free limits.`, actions: [{ kind: "link", label: "Renew", href: "/billing", primary: true }] });
        else if (st.lapsed) items.push({ id: "plan", tone: "bad", icon: "card", priority: 5, title: "Your paid plan has ended", detail: "You are on the free limits until you renew. Nothing has been deleted.", actions: [{ kind: "link", label: "Renew", href: "/billing", primary: true }] });
      })()
    );
  }

  await Promise.all(jobs);
  return items.sort((a, b) => a.priority - b.priority);
}

export type Snapshot = {
  rent: { due: number; collected: number; waiting: number; paidCount: number; total: number } | null;
  aging: AgeBuckets | null;
  vacancy: { count: number; loss: number; potential: number } | null;
  upcoming: { label: string; when: string; tone: Tone }[];
};

/** The side panel: where this month stands. */
export async function buildSnapshot(user: AccessUser, now = new Date()): Promise<Snapshot> {
  const scope = ownerScopeFilter(user);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const showRent = user.can("rent.manage") || user.role === "OWNER";

  const [payments, unpaid, units, dueSoon, schedules, proofs] = await Promise.all([
    showRent ? prisma.payment.findMany({ where: { dueDate: { gte: monthStart, lt: monthEnd }, lease: { unit: { property: scope } } }, select: { amount: true, status: true } }) : Promise.resolve([]),
    showRent ? prisma.payment.findMany({ where: { status: { in: ["PENDING", "LATE"] }, dueDate: { lt: startOfToday }, lease: { status: "ACTIVE", unit: { property: scope } } }, select: { amount: true, dueDate: true } }) : Promise.resolve([]),
    prisma.unit.findMany({ where: { property: scope, status: "VACANT" }, select: { rentAmount: true } }),
    showRent ? prisma.payment.findMany({ where: { status: "PENDING", dueDate: { gte: startOfToday, lte: new Date(startOfToday.getTime() + 3 * DAY) }, lease: { status: "ACTIVE", unit: { property: scope } } }, include: { lease: { include: { tenant: true } } }, take: 3 }) : Promise.resolve([]),
    user.can("maintenance.manage") ? prisma.maintenanceSchedule.findMany({ where: { active: true, nextDue: { gte: startOfToday, lte: new Date(now.getTime() + 14 * DAY) }, property: scope }, orderBy: { nextDue: "asc" }, take: 3 }) : Promise.resolve([]),
    user.can("rent.manage") ? prisma.paymentProof.aggregate({ where: { orgId: user.orgId, status: "PENDING" }, _sum: { amount: true } }) : Promise.resolve(null),
  ]);

  const due = payments.reduce((s, p) => s + Number(p.amount), 0);
  const collected = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + Number(p.amount), 0);
  const upcoming: Snapshot["upcoming"] = [];
  dueSoon.forEach((p) => {
    const d = Math.max(0, Math.ceil((p.dueDate.getTime() - startOfToday.getTime()) / DAY));
    upcoming.push({ label: `${p.lease.tenant.name}'s rent`, when: d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`, tone: "info" });
  });
  schedules.forEach((s) => {
    const d = Math.ceil((s.nextDue.getTime() - now.getTime()) / DAY);
    upcoming.push({ label: s.title, when: `in ${d} day${d === 1 ? "" : "s"}`, tone: "info" });
  });

  return {
    rent: showRent ? { due, collected, waiting: Number(proofs?._sum.amount ?? 0), paidCount: payments.filter((p) => p.status === "PAID").length, total: payments.length } : null,
    aging: showRent ? ageBuckets(unpaid.map((p) => ({ dueDate: p.dueDate, amount: Number(p.amount) })), now) : null,
    vacancy: units.length ? { count: units.length, loss: units.reduce((s, u) => s + Number(u.rentAmount), 0), potential: 0 } : null,
    upcoming,
  };
}
