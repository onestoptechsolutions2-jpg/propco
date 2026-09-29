import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { GuideWizard } from "@/components/GuideWizard";
import { guidesForRole, type Progress } from "./guides";

export default async function GuidePage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const user = await requireUser();
  const scope = ownerScopeFilter(user);
  const isStaff = user.role === "ADMIN" || user.role === "STAFF";
  const { g } = await searchParams;

  const [owners, properties, units, tenants, leases, suppliers, payments, requests] = await Promise.all([
    isStaff ? prisma.owner.count({ where: { orgId: user.orgId } }) : Promise.resolve(1),
    prisma.property.count({ where: scope }),
    prisma.unit.count({ where: { property: scope } }),
    prisma.tenant.count({ where: { orgId: user.orgId } }),
    prisma.lease.count({ where: { status: "ACTIVE", unit: { property: scope } } }),
    prisma.supplier.count({ where: { orgId: user.orgId } }),
    prisma.payment.count({ where: { status: "PAID", lease: { unit: { property: scope } } } }),
    prisma.maintenanceRequest.count({ where: { unit: { property: scope } } }),
  ]);

  const progress: Progress = {
    hasOwner: owners > 0,
    hasProperty: properties > 0,
    hasUnit: units > 0,
    hasTenant: tenants > 0,
    hasLease: leases > 0,
    hasSupplier: suppliers > 0,
    hasPayment: payments > 0,
    hasRequest: requests > 0,
  };

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">Step-by-step guides</h1>
      <p className="mt-1 text-sm text-muted">
        Pick a task and we&apos;ll walk you through it, one small step at a time.
      </p>
      <GuideWizard guides={guidesForRole(user.role)} progress={progress} initialGuide={g} />
    </div>
  );
}
