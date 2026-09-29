-- CreateEnum
CREATE TYPE "SupplierTrade" AS ENUM ('PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'PAINTER', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" "SupplierTrade" NOT NULL DEFAULT 'GENERAL',
    "phone" TEXT,
    "email" TEXT,
    "rate" DECIMAL(10,2),
    "payoutMethod" TEXT,
    "mpesaNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT,
    "costEstimate" DECIMAL(10,2),
    "actualCost" DECIMAL(10,2),
    "completedAt" TIMESTAMP(3),
    "unitId" TEXT NOT NULL,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceRequest_unitId_idx" ON "MaintenanceRequest"("unitId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_supplierId_idx" ON "MaintenanceRequest"("supplierId");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
