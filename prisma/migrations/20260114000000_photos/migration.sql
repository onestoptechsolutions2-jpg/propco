-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "caption" TEXT,
    "requestId" TEXT,
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Photo_requestId_idx" ON "Photo"("requestId");
CREATE INDEX "Photo_unitId_idx" ON "Photo"("unitId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
