/**
 * Background worker — runs as the `worker` service in docker-compose.yml
 * (start it with `docker compose --profile with-worker up`, or enable the
 * worker service in Coolify).
 *
 * Uses its own PrismaClient rather than importing src/lib/prisma so it has
 * no dependency on the Next.js path aliases or build output.
 */
import { PrismaClient } from "@prisma/client";
import cron from "node-cron";
import { notify, dispatchQueued } from "../src/lib/notify";

const prisma = new PrismaClient();

/**
 * For every active lease, make sure there's a payment row for the current
 * calendar month. If not, create a PENDING one due on the lease's start-day
 * (capped at the 28th so it exists in every month).
 */
async function generateMonthlyPayments() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const leases = await prisma.lease.findMany({ where: { status: "ACTIVE" } });
  let created = 0;

  for (const lease of leases) {
    const existing = await prisma.payment.findFirst({
      where: { leaseId: lease.id, dueDate: { gte: monthStart, lte: monthEnd } },
    });
    if (existing) continue;

    const dueDay = Math.min(lease.startDate.getDate(), 28);
    await prisma.payment.create({
      data: {
        leaseId: lease.id,
        amount: lease.rentAmount,
        dueDate: new Date(now.getFullYear(), now.getMonth(), dueDay),
        status: "PENDING",
        method: "MPESA",
      },
    });
    created++;
  }

  if (created > 0) console.log(`[worker] created ${created} pending payment(s)`);
}

/** Flip any still-unpaid PENDING payment past its due date to LATE, and tell the tenant. */
async function flagLatePayments() {
  const overdue = await prisma.payment.findMany({
    where: { status: "PENDING", dueDate: { lt: new Date() } },
    include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } },
  });
  if (overdue.length === 0) return;

  await prisma.payment.updateMany({
    where: { id: { in: overdue.map((p) => p.id) } },
    data: { status: "LATE" },
  });
  console.log(`[worker] flagged ${overdue.length} payment(s) as LATE`);

  for (const p of overdue) {
    await notify(prisma, {
      event: "RENT_LATE",
      to: p.lease.tenant,
      subject: "Rent overdue",
      body: `Your rent of KES ${Number(p.amount).toLocaleString("en-US")} for ${p.lease.unit.property.name} · ${p.lease.unit.label} was due on ${p.dueDate.toISOString().slice(0, 10)} and is still unpaid.`,
      dedupeKey: `RENT_LATE:${p.id}`,
    });
  }
}

/** Tell owners (and the tenant) about active leases ending within 60 days. */
async function notifyExpiringLeases() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const leases = await prisma.lease.findMany({
    where: { status: "ACTIVE", endDate: { gte: now, lte: horizon } },
    include: { tenant: true, unit: { include: { property: { include: { owner: true } } } } },
  });
  for (const l of leases) {
    const end = l.endDate!.toISOString().slice(0, 10);
    const where = `${l.unit.property.name} · ${l.unit.label}`;
    await notify(prisma, {
      event: "LEASE_EXPIRING",
      to: l.unit.property.owner,
      subject: "Lease expiring soon",
      body: `${l.tenant.name}'s lease at ${where} ends on ${end}.`,
      dedupeKey: `LEASE_EXPIRING:${l.id}:owner`,
    });
    await notify(prisma, {
      event: "LEASE_EXPIRING",
      to: l.tenant,
      subject: "Your lease is ending soon",
      body: `Your lease at ${where} ends on ${end}.`,
      dedupeKey: `LEASE_EXPIRING:${l.id}:tenant`,
    });
  }
}

async function runDailyJob(): Promise<boolean> {
  console.log(`[worker] daily job starting at ${new Date().toISOString()}`);
  try {
    await generateMonthlyPayments();
    await flagLatePayments();
    await notifyExpiringLeases();
    console.log("[worker] daily job finished");
    return true;
  } catch (error) {
    console.error("[worker] daily job failed:", error);
    return false;
  }
}

/**
 * On a fresh deploy the worker can start before the `app` container has
 * finished applying migrations (the worker only waits for Postgres to be
 * healthy, not for the schema to exist). Retry the boot-time run a few
 * times instead of failing once and then sitting idle until tomorrow.
 */
async function runOnBootWithRetry(attempts = 10, delayMs = 15_000) {
  for (let i = 1; i <= attempts; i++) {
    if (await runDailyJob()) return;
    if (i < attempts) {
      console.log(`[worker] retrying boot run in ${delayMs / 1000}s (${i}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  console.error("[worker] boot run never succeeded; will try again at the next scheduled run");
}

// Run once on boot (so a fresh deploy doesn't wait until tomorrow), then
// every day at 00:05 server time.
void runOnBootWithRetry();
cron.schedule("5 0 * * *", () => void runDailyJob());
// Deliver queued notifications every minute.
cron.schedule("* * * * *", () => {
  dispatchQueued(prisma).then(
    (c) => c.sent + c.failed + c.skipped > 0 && console.log("[worker] notifications:", c),
    (e) => console.error("[worker] dispatch failed:", e)
  );
});

console.log("[worker] started — daily rent job scheduled for 00:05");

async function shutdown() {
  console.log("[worker] shutting down");
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
