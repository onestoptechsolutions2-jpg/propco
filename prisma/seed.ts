import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Migration 20260107000000_multi_tenancy creates this org; upsert keeps the
  // seed safe on databases that somehow lack it.
  const org = await prisma.organization.upsert({
    where: { id: "org_default" },
    update: {},
    create: {
      id: "org_default",
      name: "My Agency",
      plan: "SCALE",
      trialEndsAt: new Date(),
      paidUntil: new Date(Date.now() + 100 * 365 * 86_400_000),
    },
  });

  const passwordHash = await bcrypt.hash("changeme123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@propco.local" },
    update: {},
    create: {
      orgId: org.id,
      email: "admin@propco.local",
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  const owner = await prisma.owner.upsert({
    where: { orgId_email: { orgId: org.id, email: "owner@propco.local" } },
    update: {},
    create: {
      orgId: org.id,
      name: "Sample Owner",
      email: "owner@propco.local",
      phone: "+254700000000",
      payoutMethod: "mpesa",
      mpesaNumber: "254700000000",
    },
  });

  // Sample property/unit data is only created once — this script runs on
  // every deploy (see docker-entrypoint.sh), so guard against creating a
  // duplicate "Nyali Court Apartments" on every restart.
  const existingSample = await prisma.property.findFirst({
    where: { name: "Nyali Court Apartments", ownerId: owner.id },
  });

  const property =
    existingSample ??
    (await prisma.property.create({
      data: {
        orgId: org.id,
        name: "Nyali Court Apartments",
        addressLine1: "Links Road",
        city: "Mombasa",
        type: "BUILDING",
        managementMode: "AGENCY_MANAGED",
        ownerId: owner.id,
        units: {
          create: [
            { label: "Unit 1A", bedrooms: 2, bathrooms: 1, rentAmount: 35000, status: "OCCUPIED" },
            { label: "Unit 1B", bedrooms: 1, bathrooms: 1, rentAmount: 25000, status: "VACANT" },
            { label: "Unit 2A", bedrooms: 3, bathrooms: 2, rentAmount: 55000, status: "MAINTENANCE" },
          ],
        },
      },
    }));

  // Sample tenant + lease + one paid month of rent, so /rent and /payouts
  // have data to show right after the first deploy. Created only on the
  // very first boot (keyed on the sample tenant's email) — the seed re-runs
  // on every deploy and must not keep inventing rent payments.
  const existingTenant = await prisma.tenant.findFirst({ where: { email: "tenant@propco.local" } });
  if (!existingTenant) {
    const unit = await prisma.unit.findFirst({
      where: { propertyId: property.id, label: "Unit 1A" },
    });
    if (unit) {
      const now = new Date();
      const tenant = await prisma.tenant.create({
        data: { orgId: org.id, name: "Sample Tenant", email: "tenant@propco.local", phone: "+254711000000" },
      });
      const lease = await prisma.lease.create({
        data: {
          unitId: unit.id,
          tenantId: tenant.id,
          startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
          rentAmount: 35000,
          depositAmount: 35000,
        },
      });
      await prisma.payment.create({
        data: {
          leaseId: lease.id,
          amount: 35000,
          dueDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5)),
          paidDate: now,
          method: "MPESA",
          status: "PAID",
          reference: "SAMPLE-MPESA-001",
        },
      });
    }
  }

  console.log({ admin: admin.email, owner: owner.name, property: property.name });
  console.log("Admin login: admin@propco.local / changeme123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
