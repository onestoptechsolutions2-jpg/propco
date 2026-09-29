-- AlterTable
ALTER TABLE "Payout" ADD COLUMN "maintenance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN "supplierPaidAt" TIMESTAMP(3),
ADD COLUMN "supplierPayMethod" TEXT,
ADD COLUMN "supplierPayRef" TEXT;
