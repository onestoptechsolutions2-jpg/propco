-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "SupportNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHeartbeat" (
    "name" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "info" TEXT,

    CONSTRAINT "SystemHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "SupportNote_orgId_createdAt_idx" ON "SupportNote"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportNote" ADD CONSTRAINT "SupportNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
