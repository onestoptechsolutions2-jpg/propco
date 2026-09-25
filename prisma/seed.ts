import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("changeme123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@propco.local" },
    update: {},
    create: {
      email: "admin@propco.local",
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  const owner = await prisma.owner.upsert({
    where: { email: "owner@propco.local" },
    update: {},
    create: {
      name: "Sample Owner",
      email: "owner@propco.local",
      phone: "+254700000000",
      payoutMethod: "mpesa",
      mpesaNumber: "254700000000",
    },
  });

  const property = await prisma.property.create({
    data: {
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
  });

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
