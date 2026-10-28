import type { Plan } from "@prisma/client";

/** Plan names, limits and prices. Pure data, so the worker can import it without the database client. */
export const TRIAL_DAYS = 14;

// Prices in KES per month. Edit here to change pricing everywhere.
export const PLANS: Record<Plan, { label: string; maxUnits: number; priceKes: number; blurb: string }> = {
  FREE: { label: "Free", maxUnits: 5, priceKes: 0, blurb: "Up to 5 units" },
  GROWTH: { label: "Growth", maxUnits: 50, priceKes: 2500, blurb: "Up to 50 units" },
  PRO: { label: "Pro", maxUnits: 250, priceKes: 7500, blurb: "Up to 250 units" },
  SCALE: { label: "Scale", maxUnits: Infinity, priceKes: 15000, blurb: "Unlimited units" },
};
