// TEMPORARY test helper (not committed): snapshot of everything attached to a company, and extra seed rows.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();
const mode = process.argv[2];
const ids = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

async function snapshot(tag: string) {
  const o = ids[tag];
  const units = (await prisma.unit.findMany({ where: { property: { orgId: o.org } }, select: { id: true } })).map((u) => u.id);
  return {
    properties: await prisma.property.count({ where: { orgId: o.org } }),
    units: await prisma.unit.count({ where: { propertyId: o.property } }),
    unitState: JSON.stringify(await prisma.unit.findMany({ where: { propertyId: o.property }, orderBy: { id: "asc" }, select: { id: true, status: true, stayType: true, nightlyRate: true, listed: true, listingText: true } })),
    meters: await prisma.utilityMeter.count({ where: { unitId: { in: units } } }),
    readings: await prisma.meterReading.count({ where: { meter: { unitId: { in: units } } } }),
    bookings: await prisma.booking.count({ where: { unitId: { in: units } } }),
    codes: await prisma.accessCode.count({ where: { unitId: { in: units } } }),
    requests: await prisma.maintenanceRequest.count({ where: { unitId: { in: units } } }),
    requestState: JSON.stringify(await prisma.maintenanceRequest.findMany({ where: { unitId: { in: units } }, orderBy: { id: "asc" }, select: { id: true, status: true, supplierId: true, actualCost: true } })),
    schedules: await prisma.maintenanceSchedule.count({ where: { propertyId: o.property } }),
    leases: await prisma.lease.count({ where: { unitId: { in: units } } }),
    leaseState: JSON.stringify(await prisma.lease.findMany({ where: { unitId: { in: units } }, orderBy: { id: "asc" }, select: { id: true, status: true, depositRefund: true } })),
    payments: await prisma.payment.count({ where: { lease: { unitId: { in: units } } } }),
    paymentState: JSON.stringify(await prisma.payment.findMany({ where: { lease: { unitId: { in: units } } }, orderBy: { id: "asc" }, select: { id: true, status: true, reference: true, amount: true } })),
    proofs: JSON.stringify(await prisma.paymentProof.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, status: true } })),
    photos: await prisma.photo.count({ where: { orgId: o.org } }),
    checklists: await prisma.checklist.count({ where: { lease: { unitId: { in: units } } } }),
    payouts: JSON.stringify(await prisma.payout.findMany({ where: { ownerId: o.owner }, orderBy: { id: "asc" }, select: { id: true, status: true, netAmount: true } })),
    owners: await prisma.owner.count({ where: { orgId: o.org } }),
    ownerState: JSON.stringify(await prisma.owner.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, name: true, phone: true } })),
    tenants: await prisma.tenant.count({ where: { orgId: o.org } }),
    tenantState: JSON.stringify(await prisma.tenant.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, name: true, phone: true } })),
    suppliers: await prisma.supplier.count({ where: { orgId: o.org } }),
    supplierState: JSON.stringify(await prisma.supplier.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, name: true } })),
    notifications: await prisma.notification.count({ where: { orgId: o.org } }),
    users: await prisma.user.count({ where: { orgId: o.org } }),
    employeeState: JSON.stringify(await prisma.employee.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, name: true, basicSalary: true, active: true } })),
    runState: JSON.stringify(await prisma.payrollRun.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, status: true } })),
    payslipState: JSON.stringify(await prisma.payslip.findMany({ where: { run: { orgId: o.org } }, orderBy: { id: "asc" }, select: { id: true, netPay: true, paidAt: true, extraEarnings: true } })),
    invoiceState: JSON.stringify(await prisma.supplierInvoice.findMany({ where: { orgId: o.org }, orderBy: { id: "asc" }, select: { id: true, status: true, total: true, requestId: true } })),
    org: JSON.stringify(await prisma.organization.findUnique({ where: { id: o.org }, select: { name: true, plan: true, paidUntil: true, payInstructions: true, contactPhone: true, billingNote: true } })),
  };
}

async function main() {
  if (mode === "extra") {
    const o = ids.ALPHA;
    const req = await prisma.maintenanceRequest.create({ data: { unitId: o.unit1, description: "ALPHA open request", status: "OPEN" } });
    const tenant2 = await prisma.tenant.create({ data: { orgId: o.org, name: "ALPHA Tenant Two" } });
    ids.ALPHA.openRequest = req.id;
    ids.ALPHA.tenant2 = tenant2.id;
    fs.writeFileSync(process.argv[3], JSON.stringify(ids, null, 2));
    console.log("extra ok");
  } else {
    const out = { ALPHA: await snapshot("ALPHA"), BRAVO: await snapshot("BRAVO") };
    fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 2));
    console.log("snapshot written");
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
