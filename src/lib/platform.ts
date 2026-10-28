import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/plans";
import { PLANS } from "@/lib/plan-catalog";

const DAY = 86_400_000;

/** Only PropCo staff (PLATFORM_ADMIN_EMAILS). Everyone else gets a plain 404, so the console's existence isn't advertised. */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  return user;
}

export type StatusFilter = "all" | "trial" | "paying" | "lapsed" | "free" | "suspended";
export const STATUS_FILTERS: StatusFilter[] = ["all", "trial", "paying", "lapsed", "free", "suspended"];

/** The same rules as orgStatus() in plans.ts, expressed as a database filter. */
export function statusWhere(status: StatusFilter, now = new Date()): Prisma.OrganizationWhereInput {
  const trial = { trialEndsAt: { gt: now } };
  const notTrial = { trialEndsAt: { lte: now } };
  const subscribed = { plan: { not: "FREE" as const }, paidUntil: { gt: now } };
  switch (status) {
    case "trial":
      return { suspendedAt: null, ...trial };
    case "paying":
      return { suspendedAt: null, ...notTrial, ...subscribed };
    case "lapsed":
      return { suspendedAt: null, ...notTrial, plan: { not: "FREE" }, OR: [{ paidUntil: null }, { paidUntil: { lte: now } }] };
    case "free":
      return { suspendedAt: null, ...notTrial, plan: "FREE" };
    case "suspended":
      return { suspendedAt: { not: null } };
    default:
      return {};
  }
}

export async function overview(now = new Date()) {
  const soon3 = new Date(now.getTime() + 3 * DAY);
  const soon5 = new Date(now.getTime() + 5 * DAY);
  const week = new Date(now.getTime() - 7 * DAY);
  const month = new Date(now.getTime() - 30 * DAY);
  const fortnight = new Date(now.getTime() - 14 * DAY);

  const [total, trial, paying, lapsed, suspended, signups7, signups30, subscribedByPlan, units, tenants] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: statusWhere("trial", now) }),
    prisma.organization.count({ where: statusWhere("paying", now) }),
    prisma.organization.count({ where: statusWhere("lapsed", now) }),
    prisma.organization.count({ where: statusWhere("suspended", now) }),
    prisma.organization.count({ where: { createdAt: { gte: week } } }),
    prisma.organization.count({ where: { createdAt: { gte: month } } }),
    // Same as the old page: anyone with a live paid plan counts towards revenue, even inside a trial.
    prisma.organization.groupBy({ by: ["plan"], where: { plan: { not: "FREE" }, paidUntil: { gt: now } }, _count: true }),
    prisma.unit.count(),
    prisma.tenant.count(),
  ]);
  const mrr = subscribedByPlan.reduce((sum, r) => sum + PLANS[r.plan].priceKes * r._count, 0);

  const [trialsEnding, plansEnding, recentlyLapsed, lastLogins, paidOrgs] = await Promise.all([
    prisma.organization.findMany({ where: { suspendedAt: null, trialEndsAt: { gt: now, lte: soon3 } }, orderBy: { trialEndsAt: "asc" }, take: 8, select: { id: true, name: true, trialEndsAt: true } }),
    prisma.organization.findMany({ where: { suspendedAt: null, plan: { not: "FREE" }, paidUntil: { gt: now, lte: soon5 } }, orderBy: { paidUntil: "asc" }, take: 8, select: { id: true, name: true, plan: true, paidUntil: true } }),
    prisma.organization.findMany({ where: { suspendedAt: null, plan: { not: "FREE" }, paidUntil: { gt: fortnight, lte: now }, trialEndsAt: { lte: now } }, orderBy: { paidUntil: "desc" }, take: 8, select: { id: true, name: true, plan: true, paidUntil: true } }),
    prisma.user.groupBy({ by: ["orgId"], where: { orgId: { not: null } }, _max: { lastLoginAt: true } }),
    prisma.organization.findMany({ where: statusWhere("paying", now), select: { id: true, name: true, plan: true } }),
  ]);
  // Paying customers nobody has signed in for two weeks: the quiet ones who tend to churn.
  const lastSeen = new Map(lastLogins.map((r) => [r.orgId, r._max.lastLoginAt]));
  const quiet = paidOrgs
    .map((o) => ({ ...o, last: lastSeen.get(o.id) ?? null }))
    .filter((o) => !o.last || o.last < fortnight)
    .slice(0, 8);

  return { total, trial, paying, lapsed, suspended, signups7, signups30, mrr, units, tenants, trialsEnding, plansEnding, recentlyLapsed, quiet };
}

export type Health = Awaited<ReturnType<typeof systemHealth>>;

/** Is everything that should be running, running? */
export async function systemHealth(now = new Date()) {
  const dayAgo = new Date(now.getTime() - DAY);
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const [beats, queued, failed, skipped, stuckIntents, failedIntents] = await Promise.all([
    prisma.systemHeartbeat.findMany(),
    prisma.notification.count({ where: { status: { in: ["QUEUED", "SENDING"] }, channel: { not: "WHATSAPP" } } }),
    prisma.notification.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } }),
    prisma.notification.count({ where: { status: "SKIPPED", createdAt: { gte: dayAgo } } }),
    prisma.paymentIntent.count({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 30 * 60_000) } } }),
    prisma.paymentIntent.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } }),
  ]);
  const beat = (name: string) => beats.find((b) => b.name === name)?.seenAt ?? null;
  const worker = beat("worker");
  return {
    dbOk,
    worker,
    workerOk: !!worker && now.getTime() - worker.getTime() < 3 * 60_000,
    dailyJob: beat("daily-job"),
    dailyOk: !!beat("daily-job") && now.getTime() - beat("daily-job")!.getTime() < 26 * 3_600_000,
    reconcile: beat("payments-reconcile"),
    reconcileOk: !!beat("payments-reconcile") && now.getTime() - beat("payments-reconcile")!.getTime() < 10 * 60_000,
    queued,
    failed,
    skipped,
    stuckIntents,
    failedIntents,
  };
}

export type CustomerRow = Awaited<ReturnType<typeof customerPage>>["rows"][number];

export async function customerPage(opts: { q: string; status: StatusFilter; page: number; size: number }, now = new Date()) {
  const q = opts.q.trim();
  const where: Prisma.OrganizationWhereInput = {
    ...statusWhere(opts.status, now),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { id: { endsWith: q.toLowerCase() } },
                { users: { some: { email: { contains: q, mode: "insensitive" } } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [total, orgs] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.size,
      take: opts.size,
      include: { _count: { select: { users: true, properties: true } } },
    }),
  ]);
  const ids = orgs.map((o) => o.id);
  const [unitRows, logins] = await Promise.all([
    prisma.$queryRaw<{ orgId: string; units: bigint }[]>`
      SELECT p."orgId", count(u.id) AS units FROM "Unit" u JOIN "Property" p ON p.id = u."propertyId"
      WHERE p."orgId" = ANY(${ids}) GROUP BY p."orgId"`,
    prisma.user.groupBy({ by: ["orgId"], where: { orgId: { in: ids } }, _max: { lastLoginAt: true } }),
  ]);
  const units = new Map(unitRows.map((r) => [r.orgId, Number(r.units)]));
  const last = new Map(logins.map((r) => [r.orgId, r._max.lastLoginAt]));
  return {
    total,
    rows: orgs.map((o) => ({ ...o, units: units.get(o.id) ?? 0, lastLogin: last.get(o.id) ?? null })),
  };
}

/** Everything support needs to understand one customer on one page. */
export async function customerDetail(orgId: string, now = new Date()) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return null;
  const week = new Date(now.getTime() - 7 * DAY);
  const [users, properties, unitCount, tenants, activeLeases, audit, notes, notifications, notifCounts, intents, payments, settings] = await Promise.all([
    prisma.user.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, failedLogins: true, lockedUntil: true, mustChangePassword: true, createdAt: true, orgRole: { select: { name: true } } },
    }),
    prisma.property.count({ where: { orgId } }),
    prisma.unit.count({ where: { property: { orgId } } }),
    prisma.tenant.count({ where: { orgId } }),
    prisma.lease.count({ where: { status: "ACTIVE", unit: { property: { orgId } } } }),
    prisma.auditLog.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.supportNote.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.findMany({ where: { orgId, status: { in: ["FAILED", "SKIPPED"] } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, channel: true, event: true, status: true, error: true, recipientName: true, createdAt: true } }),
    prisma.notification.groupBy({ by: ["status"], where: { orgId, createdAt: { gte: week } }, _count: true }),
    prisma.paymentIntent.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, purpose: true, provider: true, status: true, amount: true, failureReason: true, createdAt: true } }),
    prisma.payment.groupBy({ by: ["status"], where: { lease: { unit: { property: { orgId } } }, dueDate: { gte: new Date(now.getTime() - 90 * DAY) } }, _count: true }),
    prisma.paymentSettings.findUnique({ where: { orgId }, select: { mpesaEnabled: true, mpesaEnv: true, flutterwaveEnabled: true } }),
  ]);
  return { org, users, properties, unitCount, tenants, activeLeases, audit, notes, notifications, notifCounts, intents, payments, settings };
}
