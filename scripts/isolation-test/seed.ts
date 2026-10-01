import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";

const prisma = new PrismaClient();
const hash = bcrypt.hashSync("Passw0rd!x", 10);
const ids: Record<string, Record<string, string>> = {};

async function makeOrg(tag: "ALPHA" | "BRAVO") {
  const org = await prisma.organization.create({
    data: {
      name: `${tag} Realty`,
      plan: "GROWTH",
      trialEndsAt: new Date(Date.now() + 10 * 86_400_000), // trial => premium features on
      paidUntil: new Date(Date.now() + 30 * 86_400_000),
      contactPhone: "0712000000",
      payInstructions: `${tag} paybill`,
    },
  });
  const admin = await prisma.user.create({
    data: { orgId: org.id, name: `${tag} Admin`, email: `${tag.toLowerCase()}-admin@test.local`, role: "ADMIN", passwordHash: hash },
  });
  const staff = await prisma.user.create({
    data: { orgId: org.id, name: `${tag} Staff`, email: `${tag.toLowerCase()}-staff@test.local`, role: "STAFF", passwordHash: hash },
  });
  const owner = await prisma.owner.create({
    data: { orgId: org.id, name: `${tag} Owner`, email: `${tag.toLowerCase()}-owner@test.local`, phone: "0711000001", mpesaNumber: "254711000001" },
  });
  const ownerUser = await prisma.user.create({
    data: { orgId: org.id, name: `${tag} OwnerUser`, email: `${tag.toLowerCase()}-ownerlogin@test.local`, role: "OWNER", passwordHash: hash, ownerId: owner.id },
  });
  const property = await prisma.property.create({
    data: { orgId: org.id, ownerId: owner.id, name: `${tag} Towers`, addressLine1: `${tag} Road`, city: `${tag}ville`, type: "BUILDING", managementMode: "AGENCY_MANAGED" },
  });
  const unit1 = await prisma.unit.create({ data: { propertyId: property.id, label: `${tag}-U1`, rentAmount: 20000, status: "OCCUPIED" } });
  const unit2 = await prisma.unit.create({
    data: { propertyId: property.id, label: `${tag}-U2`, rentAmount: 25000, status: "VACANT", listed: true, listingText: `${tag} listing text`, stayType: "SHORT_STAY", nightlyRate: 5000 },
  });
  const tenant = await prisma.tenant.create({
    data: { orgId: org.id, name: `${tag} Tenant`, email: `${tag.toLowerCase()}-tenant@test.local`, phone: "0722000001", idNumber: `${tag}-ID` },
  });
  const lease = await prisma.lease.create({
    data: { unitId: unit1.id, tenantId: tenant.id, startDate: new Date(Date.now() - 200 * 86_400_000), rentAmount: 20000, depositAmount: 20000 },
  });
  const now = new Date();
  const paid = await prisma.payment.create({
    data: { leaseId: lease.id, amount: 20000, dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 5), paidDate: new Date(now.getFullYear(), now.getMonth() - 1, 5), status: "PAID", method: "MPESA", reference: `${tag}REF001` },
  });
  const late = await prisma.payment.create({
    data: { leaseId: lease.id, amount: 20000, dueDate: new Date(now.getFullYear(), now.getMonth(), 1), status: "LATE", method: "MPESA" },
  });
  const supplier = await prisma.supplier.create({ data: { orgId: org.id, name: `${tag} Plumbing Co`, trade: "PLUMBER", phone: "0733000001" } });
  const request = await prisma.maintenanceRequest.create({
    data: { unitId: unit1.id, supplierId: supplier.id, description: `${tag} burst pipe`, status: "DONE", actualCost: 3000, completedAt: now },
  });
  const payout = await prisma.payout.create({
    data: { ownerId: owner.id, periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59)), grossRent: 20000, commission: 2000, maintenance: 3000, netAmount: 15000 },
  });
  const meter = await prisma.utilityMeter.create({ data: { unitId: unit1.id, type: "WATER", label: `${tag}-METER`, rate: 100, unitName: "m3" } });
  const reading = await prisma.meterReading.create({
    data: { meterId: meter.id, leaseId: lease.id, readingDate: now, reading: 50, previousReading: 10, consumption: 40, amount: 4000, alert: `${tag} alert` },
  });
  const proof = await prisma.paymentProof.create({ data: { orgId: org.id, rawMessage: `${tag}PROOF1 Confirmed. Ksh20,000.00 received from ${tag} PAYER 0722000001`, code: `${tag}PROOF1`, amount: 20000 } });
  const schedule = await prisma.maintenanceSchedule.create({ data: { propertyId: property.id, title: `${tag} tank cleaning`, intervalMonths: 6, nextDue: new Date(Date.now() - 86_400_000) } });
  const booking = await prisma.booking.create({
    data: { unitId: unit2.id, guestName: `${tag} Guest`, checkIn: new Date(Date.now() + 86_400_000), checkOut: new Date(Date.now() + 3 * 86_400_000), nightlyRate: 5000, total: 10000 },
  });
  const code = await prisma.accessCode.create({ data: { unitId: unit1.id, label: `${tag} caretaker`, code: "123456" } });
  const photo = await prisma.photo.create({ data: { orgId: org.id, requestId: request.id, mime: "image/jpeg", data: new Uint8Array([1, 2, 3]) } });
  const checklist = await prisma.checklist.create({
    data: { leaseId: lease.id, type: "MOVE_IN", items: { create: [{ category: "TASK", label: `${tag} task` }] } },
  });
  const note = await prisma.notification.create({
    data: { orgId: org.id, event: "TEST", channel: "WHATSAPP", recipientName: `${tag} Tenant`, recipient: "0722000001", subject: `${tag} subject`, body: `${tag} body` },
  });
  const partner = await prisma.servicePartner.upsert({
    where: { id: "partner1" },
    update: {},
    create: { id: "partner1", name: "Shared Insurer", category: "INSURANCE", phone: "0700000000" },
  });
  await prisma.serviceLead.create({ data: { partnerId: partner.id, orgId: org.id, note: `${tag} lead` } });

  const employee = await prisma.employee.create({ data: { orgId: org.id, name: `${tag} Employee`, basicSalary: 50000 } });
  const run = await prisma.payrollRun.create({
    data: {
      orgId: org.id,
      period: new Date(Date.UTC(2026, 0, 1)),
      payslips: {
        create: [{ employeeId: employee.id, basic: 50000, allowances: 0, extraEarnings: 0, gross: 50000, nssf: 3000, shif: 1375, housingLevy: 750, taxablePay: 44875, paye: 8000, otherDeductions: 0, netPay: 36875, employerNssf: 3000, employerHousingLevy: 750 }],
      },
    },
    include: { payslips: true },
  });
  const invoice = await prisma.supplierInvoice.create({
    data: { orgId: org.id, supplierId: supplier.id, requestId: request.id, description: `${tag} invoice`, amount: 1000, vat: 160, total: 1160 },
  });

  ids[tag] = {
    employee: employee.id, run: run.id, payslip: run.payslips[0].id, invoice: invoice.id,
    org: org.id, admin: admin.id, staff: staff.id, owner: owner.id, ownerUser: ownerUser.id, property: property.id,
    unit1: unit1.id, unit2: unit2.id, tenant: tenant.id, lease: lease.id, paid: paid.id, late: late.id,
    supplier: supplier.id, request: request.id, payout: payout.id, meter: meter.id, reading: reading.id,
    proof: proof.id, schedule: schedule.id, booking: booking.id, code: code.id, photo: photo.id,
    checklist: checklist.id, note: note.id,
  };
}

async function main() {
  await makeOrg("ALPHA");
  await makeOrg("BRAVO");
  fs.writeFileSync("ids.json", JSON.stringify(ids, null, 2));
  console.log("seeded", Object.keys(ids));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
