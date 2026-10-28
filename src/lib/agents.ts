import { prisma } from "./prisma";

export const SOURCE_LABELS: Record<string, string> = {
  AGENT: "Agent",
  REFERRAL: "Referral",
  VACANCY_PAGE: "Vacancy page",
  WALK_IN: "Walk-in",
  SIGNBOARD: "Signboard",
  OTHER: "Other",
};

type Terms = { basis: "PERCENT_OF_FIRST_RENT" | "FLAT"; rate: number | { toString(): string } };

/** The commission an agent earns on a lease at the given monthly rent. */
export function commissionFor(agent: Terms, rent: number): number {
  const rate = Number(agent.rate.toString());
  const raw = agent.basis === "FLAT" ? rate : (rent * rate) / 100;
  return Math.round(raw * 100) / 100;
}

/**
 * Commissions that have become payable: the lease has its first rent paid and
 * the commission is still unpaid.
 */
export async function commissionsDue(orgId: string) {
  const leases = await prisma.lease.findMany({
    where: {
      agentId: { not: null },
      agentCommission: { gt: 0 },
      agentCommissionPaidAt: null,
      unit: { property: { orgId } },
      payments: { some: { status: "PAID" } },
    },
    include: { agent: true, tenant: true, unit: { include: { property: true } } },
    orderBy: { startDate: "asc" },
  });
  return leases;
}
