-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('WATER', 'ELECTRICITY', 'INTERNET', 'GAS', 'OTHER');
CREATE TYPE "BillingMode" AS ENUM ('METERED', 'FIXED');
CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PAID');
CREATE TYPE "ChecklistType" AS ENUM ('MOVE_IN', 'MOVE_OUT');

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN "depositDeductions" DECIMAL(12,2),
ADD COLUMN "depositRefund" DECIMAL(12,2),
ADD COLUMN "depositSettledAt" TIMESTAMP(3),
ADD COLUMN "depositMethod" TEXT,
ADD COLUMN "depositRef" TEXT,
ADD COLUMN "settlementNotes" TEXT;

ALTER TABLE "Tenant" ADD COLUMN "idNumber" TEXT,
ADD COLUMN "emergencyName" TEXT,
ADD COLUMN "emergencyPhone" TEXT;

-- CreateTable
CREATE TABLE "UtilityMeter" (
    "id" TEXT NOT NULL,
    "type" "UtilityType" NOT NULL,
    "label" TEXT,
    "mode" "BillingMode" NOT NULL DEFAULT 'METERED',
    "rate" DECIMAL(10,2) NOT NULL,
    "unitName" TEXT NOT NULL DEFAULT 'units',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityMeter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "reading" DECIMAL(12,2) NOT NULL,
    "previousReading" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "consumption" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'UNPAID',
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "meterId" TEXT NOT NULL,
    "leaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "type" "ChecklistType" NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "leaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT,
    "notes" TEXT,
    "cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "checklistId" TEXT NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UtilityMeter_unitId_idx" ON "UtilityMeter"("unitId");
CREATE INDEX "MeterReading_meterId_idx" ON "MeterReading"("meterId");
CREATE INDEX "MeterReading_leaseId_idx" ON "MeterReading"("leaseId");
CREATE UNIQUE INDEX "Checklist_leaseId_type_key" ON "Checklist"("leaseId", "type");
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

-- AddForeignKey
ALTER TABLE "UtilityMeter" ADD CONSTRAINT "UtilityMeter_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "UtilityMeter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
