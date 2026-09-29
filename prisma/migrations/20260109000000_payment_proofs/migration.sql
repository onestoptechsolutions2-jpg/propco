-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "code" TEXT,
    "amount" DECIMAL(12,2),
    "payerName" TEXT,
    "payerPhone" TEXT,
    "status" "ProofStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "leaseId" TEXT,
    "paymentId" TEXT,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProof_orgId_code_key" ON "PaymentProof"("orgId", "code");
CREATE INDEX "PaymentProof_orgId_status_idx" ON "PaymentProof"("orgId", "status");

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
