-- CreateEnum
CREATE TYPE "StayType" AS ENUM ('LONG_TERM', 'SHORT_STAY');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "contactPhone" TEXT;

ALTER TABLE "Unit" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "listingText" TEXT,
ADD COLUMN "amenities" TEXT,
ADD COLUMN "photoUrls" TEXT,
ADD COLUMN "stayType" "StayType" NOT NULL DEFAULT 'LONG_TERM',
ADD COLUMN "nightlyRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bookingId" TEXT,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "nightlyRate" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" TEXT NOT NULL DEFAULT 'Direct',
    "notes" TEXT,
    "cleaned" BOOLEAN NOT NULL DEFAULT true,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessCode_unitId_idx" ON "AccessCode"("unitId");
CREATE INDEX "AccessCode_bookingId_idx" ON "AccessCode"("bookingId");
CREATE INDEX "Booking_unitId_checkIn_idx" ON "Booking"("unitId", "checkIn");

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
