import { notFound } from "next/navigation";
import { ownerScopeFilter, requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { hasPremium } from "@/lib/plans";

/**
 * Load a lease the current user may manage (their company's; for landlords,
 * their own properties). Staff, admin and landlords only.
 */
export async function getManagedLease(leaseId: string, permission: string = "leases.manage") {
  const user = await requirePermission(permission);
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unit: { property: ownerScopeFilter(user) } },
    include: { tenant: true, unit: { include: { property: { include: { owner: true } } } } },
  });
  if (!lease) notFound();
  return { user, lease };
}

/** Utilities and move-in/out are paid features (available during the trial). */
export async function orgHasPremium(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  return hasPremium(org);
}

export async function assertPremium(orgId: string) {
  if (!(await orgHasPremium(orgId))) {
    throw new Error("This feature is on paid plans. Open Plan & billing to upgrade.");
  }
}
