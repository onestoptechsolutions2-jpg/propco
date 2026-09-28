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

/** Flip any still-unpaid PENDING payment past its due date to LATE. */
async function flagLatePayments() {
  const result = await prisma.payment.updateMany({
    where: { status: "PENDING", dueDate: { lt: new Date() } },
    data: { status: "LATE" },
  });
  if (result.count > 0) console.log(`[worker] flagged ${result.count} payment(s) as LATE`);
}

async function runDailyJob(): Promise<boolean> {
  console.log(`[worker] daily job starting at ${new Date().toISOString()}`);
  try {
    await generateMonthlyPayments();
    await flagLatePayments();
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

console.log("[worker] started — daily rent job scheduled for 00:05");

async function shutdown() {
  console.log("[worker] shutting down");
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
