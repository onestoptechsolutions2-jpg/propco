-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('INSURANCE', 'CLEANING', 'MOVERS', 'INTERNET', 'SECURITY', 'SOLAR', 'LEGAL', 'OTHER');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "ServicePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "description" TEXT,
    "phone" TEXT NOT NULL,
    "commissionNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceLead" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "commissionKes" DECIMAL(10,2),
    "partnerId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceLead_orgId_idx" ON "ServiceLead"("orgId");
CREATE INDEX "ServiceLead_partnerId_idx" ON "ServiceLead"("partnerId");

-- AddForeignKey
ALTER TABLE "ServiceLead" ADD CONSTRAINT "ServiceLead_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ServicePartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceLead" ADD CONSTRAINT "ServiceLead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
