import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const TRIAL_DAYS = 14;

// Prices in KES per month. Edit here to change pricing everywhere.
export const PLANS: Record<Plan, { label: string; maxUnits: number; priceKes: number; blurb: string }> = {
  FREE: { label: "Free", maxUnits: 5, priceKes: 0, blurb: "Up to 5 units" },
  GROWTH: { label: "Growth", maxUnits: 50, priceKes: 2500, blurb: "Up to 50 units" },
  PRO: { label: "Pro", maxUnits: 250, priceKes: 7500, blurb: "Up to 250 units" },
  SCALE: { label: "Scale", maxUnits: Infinity, priceKes: 15000, blurb: "Unlimited units" },
};

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
