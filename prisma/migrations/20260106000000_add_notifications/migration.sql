-- CreateEnum
CREATE TYPE "NotifyChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Owner" ADD COLUMN "notifyChannel" "NotifyChannel" NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "Tenant" ADD COLUMN "notifyChannel" "NotifyChannel" NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "Supplier" ADD COLUMN "notifyChannel" "NotifyChannel" NOT NULL DEFAULT 'EMAIL';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "NotifyChannel" NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipient" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "dedupeKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_status_idx" ON "Notification"("status");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
