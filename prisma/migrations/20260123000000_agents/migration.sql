-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('LEASING', 'REFERRAL');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('PERCENT_OF_FIRST_RENT', 'FLAT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('AGENT', 'REFERRAL', 'VACANCY_PAGE', 'WALK_IN', 'SIGNBOARD', 'OTHER');

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN "source" "LeadSource",
ADD COLUMN "agentId" TEXT,
ADD COLUMN "agentCommission" DECIMAL(10,2),
ADD COLUMN "agentCommissionPaidAt" TIMESTAMP(3),
ADD COLUMN "agentCommissionMethod" TEXT,
ADD COLUMN "agentCommissionRef" TEXT;

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "kind" "AgentKind" NOT NULL DEFAULT 'LEASING',
    "basis" "CommissionBasis" NOT NULL DEFAULT 'PERCENT_OF_FIRST_RENT',
    "rate" DECIMAL(10,2) NOT NULL,
    "mpesaNumber" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agent_orgId_idx" ON "Agent"("orgId");

-- CreateIndex
CREATE INDEX "Lease_agentId_idx" ON "Lease"("agentId");

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
