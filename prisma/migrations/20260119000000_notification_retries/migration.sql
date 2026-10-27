-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "lockedAt" TIMESTAMP(3);
