import { prisma } from "@/lib/prisma";

const GRACE_DAYS = 2;
const DAY = 86_400_000;

export type Reliability = {
  periods: number; // rent periods that have fallen due
  onTime: number;
  late: number; // paid, but after the grace period
  unpaid: number; // due and still not paid
  avgDaysLate: number;
  score: number | null; // 0-100, null when there is too little history
  rating: "Excellent" | "Good" | "Fair" | "Poor" | "Not enough history";
};

/** Rent-payment reliability for a tenant, from every lease they have had with this company. */
export async function tenantReliability(tenantId: string, orgId: string): Promise<Reliability> {
  const payments = await prisma.payment.findMany({
    where: {
      dueDate: { lte: new Date() },
      status: { not: "FAILED" },
      lease: { tenantId, tenant: { orgId } },
    },
    select: { status: true, dueDate: true, paidDate: true },
  });

  let onTime = 0;
  let late = 0;
  let unpaid = 0;
  let lateDaysTotal = 0;

  for (const p of payments) {
    if (p.status === "PAID" && p.paidDate) {
      const daysLate = Math.floor((p.paidDate.getTime() - p.dueDate.getTime()) / DAY);
      if (daysLate <= GRACE_DAYS) onTime++;
      else {
        late++;
        lateDaysTotal += daysLate;
      }
    } else {
      unpaid++;
    }
  }

  const periods = payments.length;
  const avgDaysLate = late > 0 ? Math.round(lateDaysTotal / late) : 0;

  if (periods < 3) {
    return { periods, onTime, late, unpaid, avgDaysLate, score: null, rating: "Not enough history" };
  }

  const score = Math.max(
    0,
    Math.round((onTime / periods) * 100 - Math.min(20, avgDaysLate) - unpaid * 10)
  );
  const rating = score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 50 ? "Fair" : "Poor";
  return { periods, onTime, late, unpaid, avgDaysLate, score, rating };
}
