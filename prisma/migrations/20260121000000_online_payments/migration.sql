-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntentPurpose" AS ENUM ('RENT', 'SUBSCRIPTION');

-- CreateTable
CREATE TABLE "PaymentSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callbackToken" TEXT NOT NULL,
    "mpesaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mpesaEnv" TEXT NOT NULL DEFAULT 'sandbox',
    "mpesaKind" TEXT NOT NULL DEFAULT 'PAYBILL',
    "mpesaShortcode" TEXT,
    "mpesaPartyB" TEXT,
    "mpesaConsumerKeyEnc" TEXT,
    "mpesaConsumerSecretEnc" TEXT,
    "mpesaPasskeyEnc" TEXT,
    "flutterwaveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "flutterwaveSecretKeyEnc" TEXT,
    "flutterwaveHashEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "purpose" "IntentPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IntentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "phone" TEXT,
    "providerRef" TEXT,
    "receipt" TEXT,
    "paidAmount" DECIMAL(12,2),
    "failureReason" TEXT,
    "checkoutUrl" TEXT,
    "leaseId" TEXT,
    "paymentId" TEXT,
    "plan" "Plan",
    "months" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettings_orgId_key" ON "PaymentSettings"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettings_callbackToken_key" ON "PaymentSettings"("callbackToken");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_provider_providerRef_key" ON "PaymentIntent"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "PaymentIntent_orgId_createdAt_idx" ON "PaymentIntent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "PaymentIntent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_leaseId_idx" ON "PaymentIntent"("leaseId");

-- AddForeignKey
ALTER TABLE "PaymentSettings" ADD CONSTRAINT "PaymentSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
