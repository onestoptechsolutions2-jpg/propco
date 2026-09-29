-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'GROWTH', 'PRO', 'SCALE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "paidUntil" TIMESTAMP(3),
    "billingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- Existing data (single-company install) moves into one unlimited organization.
INSERT INTO "Organization" ("id", "name", "plan", "trialEndsAt", "paidUntil", "updatedAt")
VALUES ('org_default', 'My Agency', 'SCALE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '100 years', CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "orgId" TEXT;
UPDATE "User" SET "orgId" = 'org_default';
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Owner" ADD COLUMN "orgId" TEXT;
UPDATE "Owner" SET "orgId" = 'org_default';
ALTER TABLE "Owner" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Property" ADD COLUMN "orgId" TEXT;
UPDATE "Property" SET "orgId" = 'org_default';
ALTER TABLE "Property" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Property" ADD CONSTRAINT "Property_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tenant" ADD COLUMN "orgId" TEXT;
UPDATE "Tenant" SET "orgId" = 'org_default';
ALTER TABLE "Tenant" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD COLUMN "orgId" TEXT;
UPDATE "Supplier" SET "orgId" = 'org_default';
ALTER TABLE "Supplier" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD COLUMN "orgId" TEXT;
UPDATE "Notification" SET "orgId" = 'org_default';
ALTER TABLE "Notification" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Owner emails are unique per organization, not globally.
DROP INDEX "Owner_email_key";
CREATE UNIQUE INDEX "Owner_orgId_email_key" ON "Owner"("orgId", "email");
CREATE INDEX "Owner_orgId_idx" ON "Owner"("orgId");
