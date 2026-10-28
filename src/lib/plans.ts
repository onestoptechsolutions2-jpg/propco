import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

import { PLANS, TRIAL_DAYS } from "./plan-catalog";

export { PLANS, TRIAL_DAYS };

type OrgBilling = { plan: Plan; trialEndsAt: Date; paidUntil: Date | null };

/** What limits apply to this organization right now. */
export function orgStatus(org: OrgBilling, now = new Date()) {
  const inTrial = org.trialEndsAt > now;
  const subscribed = org.plan !== "FREE" && !!org.paidUntil && org.paidUntil > now;
  const effectivePlan: Plan = subscribed ? org.plan : "FREE";
  const maxUnits = inTrial ? Infinity : PLANS[effectivePlan].maxUnits;
  const trialDaysLeft = inTrial
    ? Math.max(1, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : 0;
  const lapsed = org.plan !== "FREE" && !subscribed && !inTrial;
  return { inTrial, trialDaysLeft, subscribed, effectivePlan, maxUnits, lapsed };
}

/** Throws a friendly error when adding `adding` units would exceed the plan. */
export async function assertCanAddUnits(orgId: string, adding: number) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const { maxUnits, effectivePlan } = orgStatus(org);
  if (maxUnits === Infinity) return;
  const current = await prisma.unit.count({ where: { property: { orgId } } });
  if (current + adding > maxUnits) {
    throw new Error(
      `Your ${PLANS[effectivePlan].label} plan allows ${maxUnits} units and you have ${current}. ` +
        `Open Billing to upgrade and add more.`
    );
  }
}

export function isPlatformAdmin(email?: string | null) {
  if (!email) return false;
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Paid-only features (utilities billing, move-in/out): open during the trial and on any active paid plan. */
export function hasPremium(org: OrgBilling, now = new Date()) {
  const s = orgStatus(org, now);
  return s.inTrial || s.subscribed;
}
