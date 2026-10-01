"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { assertPremium } from "@/lib/lease-access";
import { notifyUtilityBill } from "@/lib/notify-events";
import { detectUsageAlert } from "@/lib/usage-alerts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const round2 = (n: number) => Math.round(n * 100) / 100;

const meterSchema = z.object({
  unitId: z.string().min(1, "Choose a unit"),
  type: z.enum(["WATER", "ELECTRICITY", "INTERNET", "GAS", "OTHER"]),
  label: z.string().optional(),
  mode: z.enum(["METERED", "FIXED"]),
  rate: z.coerce.number().nonnegative(),
  unitName: z.string().min(1).default("units"),
});

export async function createMeter(formData: FormData) {
  const user = await requirePermission("utilities.manage");
  await assertPremium(user.orgId);

  const parsed = meterSchema.parse({
    unitId: formData.get("unitId"),
    type: formData.get("type"),
    label: formData.get("label") || undefined,
    mode: formData.get("mode"),
    rate: formData.get("rate"),
    unitName: formData.get("unitName") || undefined,
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, property: ownerScopeFilter(user) },
  });
  if (!unit) throw new Error("You don't have permission to add a meter to this unit.");

  await prisma.utilityMeter.create({ data: parsed });
  revalidatePath("/utilities");
  redirect("/utilities");
}

export async function deactivateMeter(meterId: string) {
  const user = await requirePermission("utilities.manage");
  await prisma.utilityMeter.updateMany({
    where: { id: meterId, unit: { property: ownerScopeFilter(user) } },
    data: { active: false },
  });
  revalidatePath("/utilities");
}

/**
 * Record readings for many meters at once (a caretaker walking a building).
 * Form fields: `reading_<meterId>` (metered) and `bill_<meterId>` (fixed fee).
 * kind=OPENING records a baseline for a new tenant without billing anyone.
 */
export async function recordReadings(formData: FormData) {
  const user = await requirePermission("utilities.manage");
  await assertPremium(user.orgId);

  const kind = formData.get("kind") === "OPENING" ? "OPENING" : "BILL";
  const readingDate = new Date(String(formData.get("readingDate") || new Date().toISOString().slice(0, 10)));
  const propertyId = String(formData.get("propertyId") ?? "");

  const meters = await prisma.utilityMeter.findMany({
    where: { active: true, unit: { propertyId, property: ownerScopeFilter(user) } },
    include: {
      unit: { include: { leases: { where: { status: "ACTIVE" }, take: 1 } } },
      readings: { orderBy: [{ readingDate: "desc" }, { createdAt: "desc" }], take: 4 },
    },
  });

  const billed: string[] = [];

  for (const meter of meters) {
    const leaseId = meter.unit.leases[0]?.id ?? null;

    if (meter.mode === "FIXED") {
      if (formData.get(`bill_${meter.id}`) !== "on") continue;
      const r = await prisma.meterReading.create({
        data: {
          meterId: meter.id,
          leaseId,
          readingDate,
          reading: 0,
          previousReading: 0,
          consumption: 0,
          amount: Number(meter.rate),
          notes: "Fixed monthly fee",
        },
      });
      billed.push(r.id);
      continue;
    }

    const raw = String(formData.get(`reading_${meter.id}`) ?? "").trim();
    if (raw === "") continue;
    const reading = Number(raw);
    if (!Number.isFinite(reading) || reading < 0) continue;

    const previous = meter.readings[0] ? Number(meter.readings[0].reading) : null;
    if (previous !== null && reading < previous) {
      throw new Error(`Reading ${reading} is lower than the last reading (${previous}) for ${meter.unit.label}.`);
    }

    // The very first reading, or an explicit opening reading, is only a baseline.
    const baseline = previous === null || kind === "OPENING";
    const prev = previous ?? reading;
    const consumption = baseline ? 0 : reading - prev;
    const amount = baseline ? 0 : round2(consumption * Number(meter.rate));
    const alert = baseline
      ? null
      : detectUsageAlert({
          consumption,
          previous: meter.readings.filter((r) => r.notes !== "Opening reading").map((r) => Number(r.consumption)),
          occupied: leaseId !== null,
          type: meter.type,
        });

    const r = await prisma.meterReading.create({
      data: {
        meterId: meter.id,
        leaseId,
        readingDate,
        reading,
        previousReading: prev,
        consumption,
        amount,
        status: baseline ? "PAID" : "UNPAID",
        paidDate: baseline ? readingDate : null,
        notes: baseline ? "Opening reading" : null,
        alert,
      },
    });
    if (!baseline) billed.push(r.id);
  }

  for (const id of billed) await notifyUtilityBill(id);

  revalidatePath("/utilities");
  redirect(`/utilities?recorded=${billed.length}`);
}

export async function markBillPaid(readingId: string) {
  const user = await requirePermission("utilities.manage");
  await prisma.meterReading.updateMany({
    where: { id: readingId, status: "UNPAID", meter: { unit: { property: ownerScopeFilter(user) } } },
    data: { status: "PAID", paidDate: new Date() },
  });
  revalidatePath("/utilities");
}
