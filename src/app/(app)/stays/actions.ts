"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter, type AccessUser } from "@/lib/access";
import { assertPremium } from "@/lib/lease-access";
import { generateCode } from "@/lib/access-codes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BookingStatus } from "@prisma/client";

const round2 = (n: number) => Math.round(n * 100) / 100;
const back: (q?: string) => never = (q = "") => redirect(`/stays${q}`);

async function ownUnit(user: AccessUser, unitId: string) {
  const unit = await prisma.unit.findFirst({ where: { id: unitId, property: ownerScopeFilter(user) } });
  if (!unit) throw new Error("You don't have permission for this unit.");
  return unit;
}

async function ownBooking(user: AccessUser, id: string) {
  const b = await prisma.booking.findFirst({ where: { id, unit: { property: ownerScopeFilter(user) } } });
  if (!b) throw new Error("Booking not found.");
  return b;
}

export async function enableShortStay(formData: FormData) {
  const user = await requirePermission("stays.manage");
  await assertPremium(user.orgId);
  const unitId = String(formData.get("unitId") ?? "");
  const rate = Number(formData.get("nightlyRate"));
  if (!Number.isFinite(rate) || rate <= 0) back("?error=" + encodeURIComponent("Enter the price per night."));
  await ownUnit(user, unitId);
  await prisma.unit.update({ where: { id: unitId }, data: { stayType: "SHORT_STAY", nightlyRate: rate } });
  revalidatePath("/stays");
  back("?enabled=1");
}

const bookingSchema = z.object({
  unitId: z.string().min(1),
  guestName: z.string().trim().min(2, "Enter the guest's name"),
  guestPhone: z.string().optional(),
  guests: z.coerce.number().int().min(1).max(50).default(1),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  nightlyRate: z.coerce.number().positive(),
  source: z.string().trim().default("Direct"),
  notes: z.string().optional(),
});

export async function createBooking(formData: FormData) {
  const user = await requirePermission("stays.manage");
  await assertPremium(user.orgId);

  const parsed = bookingSchema.safeParse({
    unitId: formData.get("unitId"),
    guestName: formData.get("guestName"),
    guestPhone: formData.get("guestPhone") || undefined,
    guests: formData.get("guests") || 1,
    checkIn: formData.get("checkIn"),
    checkOut: formData.get("checkOut"),
    nightlyRate: formData.get("nightlyRate"),
    source: formData.get("source") || "Direct",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) back("?error=" + encodeURIComponent(parsed.error.issues[0].message));
  const d = parsed.data!;

  const unit = await ownUnit(user, d.unitId);
  if (unit.stayType !== "SHORT_STAY") back("?error=" + encodeURIComponent("Turn on short stays for that unit first."));

  const checkIn = new Date(`${d.checkIn}T14:00:00`);
  const checkOut = new Date(`${d.checkOut}T11:00:00`);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
  if (!(nights >= 1)) back("?error=" + encodeURIComponent("Check-out must be after check-in."));

  // No double booking: any live booking that overlaps these dates blocks it.
  const clash = await prisma.booking.findFirst({
    where: {
      unitId: d.unitId,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
  });
  if (clash) {
    back(
      "?error=" +
        encodeURIComponent(
          `Already booked by ${clash.guestName} (${clash.checkIn.toISOString().slice(0, 10)} to ${clash.checkOut.toISOString().slice(0, 10)}).`
        )
    );
  }

  const booking = await prisma.booking.create({
    data: {
      unitId: d.unitId,
      guestName: d.guestName,
      guestPhone: d.guestPhone,
      guests: d.guests,
      checkIn,
      checkOut,
      nightlyRate: d.nightlyRate,
      total: round2(nights * d.nightlyRate),
      source: d.source || "Direct",
      notes: d.notes,
    },
  });

  if (formData.get("makeCode") === "on") {
    await prisma.accessCode.create({
      data: {
        unitId: d.unitId,
        label: `Guest: ${d.guestName}`.slice(0, 60),
        code: generateCode(),
        validFrom: checkIn,
        validTo: checkOut,
        bookingId: booking.id,
      },
    });
  }

  revalidatePath("/stays");
  back("?added=1");
}

export async function setBookingStatus(id: string, status: BookingStatus) {
  const user = await requirePermission("stays.manage");
  const b = await ownBooking(user, id);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: { status, ...(status === "CHECKED_OUT" ? { cleaned: false } : {}) },
    });
    if (status === "CHECKED_IN") {
      await tx.unit.update({ where: { id: b.unitId }, data: { status: "OCCUPIED" } });
    }
    if (status === "CHECKED_OUT" || status === "CANCELLED") {
      if (status === "CHECKED_OUT") await tx.unit.update({ where: { id: b.unitId }, data: { status: "VACANT" } });
      // The guest's door code stops working.
      await tx.accessCode.updateMany({
        where: { bookingId: id, active: true },
        data: { active: false, validTo: new Date() },
      });
    }
  });
  revalidatePath("/stays");
}

export async function recordBookingPayment(id: string, formData: FormData) {
  const user = await requirePermission("stays.manage");
  const b = await ownBooking(user, id);
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) back("?error=" + encodeURIComponent("Enter the amount received."));
  const paid = Math.min(Number(b.total), round2(Number(b.paid) + amount));
  await prisma.booking.update({ where: { id }, data: { paid } });
  revalidatePath("/stays");
}

export async function markCleaned(id: string) {
  const user = await requirePermission("stays.manage");
  await ownBooking(user, id);
  await prisma.booking.update({ where: { id }, data: { cleaned: true } });
  revalidatePath("/stays");
}
