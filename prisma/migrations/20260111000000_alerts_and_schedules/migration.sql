-- AlterTable
ALTER TABLE "MeterReading" ADD COLUMN "alert" TEXT;

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intervalMonths" INTEGER NOT NULL,
    "nextDue" TIMESTAMP(3) NOT NULL,
    "lastDone" TIMESTAMP(3),
    "estimatedCost" DECIMAL(10,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "propertyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_propertyId_idx" ON "MaintenanceSchedule"("propertyId");
CREATE INDEX "MaintenanceSchedule_nextDue_idx" ON "MaintenanceSchedule"("nextDue");

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
