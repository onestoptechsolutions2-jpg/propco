/**
 * Completes payment intents. Only relative imports: scripts/worker.ts uses this file too.
 *
 * Every route to "this payment succeeded" (webhook, redirect, the worker's status
 * check) ends in applyOutcome(). It is safe to call any number of times, from
 * several processes: the intent is claimed (PENDING -> SUCCESS/FAILED) and the money
 * effect applied in ONE database transaction, so the effect happens once or not at all.
 */
import type { IntentPurpose, PrismaClient } from "@prisma/client";
import { PLANS } from "../plan-catalog";
import { merchantForIntent } from "./config";
import { stkQuery } from "./mpesa";
import { verifyByReference } from "./flutterwave";
import type { Outcome } from "./types";

type Intent = NonNullable<Awaited<ReturnType<PrismaClient["paymentIntent"]["findUnique"]>>>;

export type Applied =
  | { result: "completed"; paymentId?: string }
  | { result: "failed" }
  | { result: "already" }
  | { result: "pending" };

const PAYMENT_METHOD = { MPESA: "MPESA", FLUTTERWAVE: "CARD" } as const;
const DAY = 86_400_000;

export async function applyOutcome(db: PrismaClient, intentId: string, outcome: Outcome): Promise<Applied> {
  if (outcome.state === "PENDING") return { result: "pending" };

  if (outcome.state === "FAILED") {
    const claimed = await db.paymentIntent.updateMany({
      where: { id: intentId, status: "PENDING" },
      data: { status: "FAILED", failureReason: outcome.reason.slice(0, 300), completedAt: new Date() },
    });
    return claimed.count ? { result: "failed" } : { result: "already" };
  }

  return db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.status !== "PENDING") return { result: "already" } as Applied;

    const paid = outcome.paidAmount > 0 ? outcome.paidAmount : Number(intent.amount);
    const note = Math.abs(paid - Number(intent.amount)) > 1 ? `Paid ${paid} instead of ${Number(intent.amount)}` : null;

    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intentId, status: "PENDING" },
      data: { status: "SUCCESS", receipt: outcome.receipt || null, paidAmount: paid, failureReason: note, completedAt: new Date() },
    });
    if (claimed.count === 0) return { result: "already" } as Applied;

    const effect: { paymentId?: string } = intent.purpose === "RENT" ? await applyRent(tx, intent, paid, outcome.receipt) : await applySubscription(tx, intent, paid);
    await tx.auditLog.create({
      data: {
        orgId: intent.orgId,
        actorName: "Online payment",
        action: intent.purpose === "RENT" ? "payment.online" : "billing.online",
        detail: `${intent.provider} KES ${paid}${outcome.receipt ? ` ${outcome.receipt}` : ""}${note ? ` (${note})` : ""}`,
      },
    });
    return { result: "completed", paymentId: effect.paymentId } as Applied;
  });
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function applyRent(tx: Tx, intent: Intent, paid: number, receipt: string) {
  if (!intent.leaseId) throw new Error("Rent intent has no lease");
  const lease = await tx.lease.findFirst({
    where: { id: intent.leaseId, unit: { property: { orgId: intent.orgId } } },
  });
  if (!lease) throw new Error("Lease not found for this company");
  const method = PAYMENT_METHOD[intent.provider as keyof typeof PAYMENT_METHOD] ?? "MPESA";

  const open = intent.paymentId
    ? await tx.payment.findFirst({ where: { id: intent.paymentId, leaseId: lease.id, status: { in: ["PENDING", "LATE", "FAILED"] } } })
    : null;
  const now = new Date();
  const payment = open
    ? await tx.payment.update({
        where: { id: open.id },
        data: { status: "PAID", paidDate: now, amount: paid, method, reference: receipt || null, notes: "Paid online" },
      })
    : await tx.payment.create({
        data: { leaseId: lease.id, amount: paid, dueDate: now, paidDate: now, status: "PAID", method, reference: receipt || null, notes: "Paid online" },
      });
  await tx.paymentIntent.update({ where: { id: intent.id }, data: { paymentId: payment.id } });
  return { paymentId: payment.id };
}

async function applySubscription(tx: Tx, intent: Intent, paid: number) {
  const plan = intent.plan;
  const months = intent.months ?? 1;
  if (!plan || !(plan in PLANS)) throw new Error("Subscription intent has no plan");
  const price = PLANS[plan].priceKes * months;
  const org = await tx.organization.findUniqueOrThrow({ where: { id: intent.orgId } });

  if (paid + 1 < price) {
    // Money arrived but not enough to switch the plan on: leave the plan alone and flag it for a human.
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { failureReason: `Underpaid: received KES ${paid}, needed KES ${price}. Plan not changed.` },
    });
    await tx.organization.update({
      where: { id: org.id },
      data: { billingNote: `Online payment of KES ${paid} received but ${PLANS[plan].label} x${months} costs KES ${price}; contact support.` },
    });
    return {};
  }
  const base = org.paidUntil && org.paidUntil > new Date() ? org.paidUntil : new Date();
  await tx.organization.update({
    where: { id: org.id },
    data: {
      plan,
      paidUntil: new Date(base.getTime() + months * 30 * DAY),
      billingNote: `${PLANS[plan].label} paid online for ${months} month(s) on ${new Date().toISOString().slice(0, 10)}`,
    },
  });
  return {};
}

/**
 * Check one intent with its provider and apply what we learn. Used by the worker
 * and by the webhooks (which never trust the webhook body on its own).
 * `known` carries details only the callback has (M-Pesa receipt and amount).
 */
export async function reconcileIntent(
  db: PrismaClient,
  intent: Intent,
  known?: { receipt?: string; amount?: number }
): Promise<Applied> {
  if (intent.status !== "PENDING") return { result: "already" };
  const merchant = await merchantForIntent(db, intent);
  if (!merchant || !intent.providerRef) return { result: "pending" };

  let outcome: Outcome = { state: "PENDING" };
  try {
    if (intent.provider === "MPESA" && merchant.mpesa) {
      outcome = await stkQuery(merchant.mpesa, intent.providerRef);
      if (outcome.state === "SUCCESS") outcome = { ...outcome, receipt: known?.receipt ?? "", paidAmount: known?.amount ?? 0 };
    } else if (intent.provider === "FLUTTERWAVE" && merchant.flutterwave) {
      const v = await verifyByReference(merchant.flutterwave, intent.providerRef);
      if (v.state === "SUCCESS" && v.currency && v.currency !== intent.currency) {
        outcome = { state: "FAILED", reason: `Wrong currency ${v.currency}` };
      } else {
        outcome = v;
      }
    }
  } catch (e) {
    console.error(`[payments] status check failed for ${intent.id}:`, e instanceof Error ? e.message : e);
    return { result: "pending" }; // provider unreachable: try again later
  }
  return applyOutcome(db, intent.id, outcome);
}

const STALE: Record<string, number> = { MPESA: 15 * 60_000, FLUTTERWAVE: 24 * 60 * 60_000 };

/**
 * Worker job: look at every unfinished intent older than a minute, ask the
 * provider, and give up on ones that never completed (an M-Pesa prompt expires
 * within minutes; a checkout link is kept for a day). Catches lost callbacks.
 */
export async function reconcilePending(db: PrismaClient, limit = 100) {
  const intents = await db.paymentIntent.findMany({
    where: { status: "PENDING", providerRef: { not: null }, createdAt: { lt: new Date(Date.now() - 60_000) } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const done: { intentId: string; purpose: IntentPurpose; paymentId?: string }[] = [];
  for (const intent of intents) {
    const applied = await reconcileIntent(db, intent);
    if (applied.result === "completed") done.push({ intentId: intent.id, purpose: intent.purpose, paymentId: applied.paymentId });
    if (applied.result === "pending" && Date.now() - intent.createdAt.getTime() > (STALE[intent.provider] ?? STALE.MPESA)) {
      await applyOutcome(db, intent.id, { state: "FAILED", reason: "Not completed in time" });
    }
  }
  return done;
}
