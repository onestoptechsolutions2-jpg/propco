import { prisma } from "./prisma";

export type OwnerMoney = {
  ownerId: string;
  name: string;
  collected: number; // rent received on their agency-managed properties
  commission: number; // our fee
  maintenance: number; // completed repair costs charged to them
  paidOut: number; // payouts already sent
  held: number; // collected - commission - maintenance - paidOut: money we hold for them
};

/**
 * What the company holds for each landlord. Uses the same basis as monthly
 * payouts (paid rent less commission less completed repairs) but over all
 * time, less what has already been paid out, so the two screens agree.
 */
export async function ownerMoney(orgId: string): Promise<OwnerMoney[]> {
  const owners = await prisma.owner.findMany({
    where: { orgId, properties: { some: { managementMode: "AGENCY_MANAGED" } } },
    include: {
      payouts: { where: { status: "PAID" }, select: { netAmount: true } },
      properties: {
        where: { managementMode: "AGENCY_MANAGED" },
        include: {
          units: {
            include: {
              maintenanceRequests: { where: { status: "DONE" }, select: { actualCost: true } },
              leases: { include: { payments: { where: { status: "PAID" }, select: { amount: true } } } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return owners.map((o) => {
    let collected = 0, commission = 0, maintenance = 0;
    for (const p of o.properties) {
      let g = 0;
      for (const u of p.units) {
        for (const r of u.maintenanceRequests) maintenance += Number(r.actualCost ?? 0);
        for (const l of u.leases) for (const pay of l.payments) g += Number(pay.amount);
      }
      collected += g;
      commission += (g * Number(p.commissionPct)) / 100;
    }
    const paidOut = o.payouts.reduce((s, x) => s + Number(x.netAmount), 0);
    return { ownerId: o.id, name: o.name, collected, commission, maintenance, paidOut, held: collected - commission - maintenance - paidOut };
  });
}

/** The three numbers an owner of the business asks: what do I hold, owe, and am I owed. */
export async function holdAndOwe(orgId: string) {
  const [owners, suppliers, rent] = await Promise.all([
    ownerMoney(orgId),
    prisma.supplierInvoice.aggregate({ where: { orgId, status: "APPROVED" }, _sum: { total: true } }),
    prisma.payment.aggregate({
      where: { status: { in: ["PENDING", "LATE"] }, dueDate: { lte: new Date() }, lease: { unit: { property: { orgId } } } },
      _sum: { amount: true },
    }),
  ]);
  return {
    heldForOwners: owners.reduce((s, o) => s + Math.max(o.held, 0), 0),
    owedToSuppliers: Number(suppliers._sum.total ?? 0),
    rentOwedToYou: Number(rent._sum.amount ?? 0),
    owners,
  };
}
