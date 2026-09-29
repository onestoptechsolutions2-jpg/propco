"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyPayoutSent } from "@/lib/notify-events";

const round2 = (n: number) => Math.round(n * 100) / 100;

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

/**
 * Build (or refresh) one payout per owner for the given month.
 *
 * Gross = rent that was due in that month and is marked PAID, across the
 * owner's AGENCY_MANAGED properties only (self-managed landlords collect
 * their own rent, so there's nothing for the agency to pay out).
 * Commission is applied per property at that property's commissionPct.
 * Maintenance = actualCost of requests completed (DONE) in the month on
 * those properties, deducted from the net.
 *
 * Safe to re-run: a PENDING payout is recalculated, a PAID one is left
 * untouched, and owners with no collected rent that month are skipped.
 */
export async function generatePayouts(formData: FormData) {
  const user = await requireRole("STAFF");

  const month = monthSchema.parse(formData.get("month"));
  const [year, mon] = month.split("-").map(Number);
  // UTC on purpose: the unique key is (owner, periodStart), so the same
  // month must always map to the exact same timestamp.
  const periodStart = new Date(Date.UTC(year, mon - 1, 1));
  const periodEnd = new Date(Date.UTC(year, mon, 0, 23, 59, 59));

  const owners = await prisma.owner.findMany({
    where: { orgId: user.orgId, properties: { some: { managementMode: "AGENCY_MANAGED" } } },
    include: {
      properties: {
        where: { managementMode: "AGENCY_MANAGED" },
        include: {
          units: {
            include: {
              maintenanceRequests: {
                where: { status: "DONE", completedAt: { gte: periodStart, lte: periodEnd } },
              },
              leases: {
                include: {
                  payments: {
                    where: { status: "PAID", dueDate: { gte: periodStart, lte: periodEnd } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  for (const owner of owners) {
    let gross = 0;
    let commission = 0;
    let maintenance = 0;

    for (const property of owner.properties) {
      let propertyGross = 0;
      for (const unit of property.units) {
        for (const req of unit.maintenanceRequests) {
          maintenance += Number(req.actualCost ?? 0);
        }
        for (const lease of unit.leases) {
          for (const payment of lease.payments) {
            propertyGross += Number(payment.amount);
          }
        }
      }
      gross += propertyGross;
      commission += (propertyGross * Number(property.commissionPct)) / 100;
    }

    gross = round2(gross);
    commission = round2(commission);
    maintenance = round2(maintenance);
    if (gross === 0 && maintenance === 0) continue;
    const netAmount = round2(gross - commission - maintenance);

    const key = { ownerId_periodStart: { ownerId: owner.id, periodStart } };
    const existing = await prisma.payout.findUnique({ where: key });
    if (existing?.status === "PAID") continue;

    await prisma.payout.upsert({
      where: key,
      create: {
        ownerId: owner.id,
        periodStart,
        periodEnd,
        grossRent: gross,
        commission,
        maintenance,
        netAmount,
      },
      update: { periodEnd, grossRent: gross, commission, maintenance, netAmount },
    });
  }

  revalidatePath("/payouts");
  redirect(`/payouts?month=${month}`);
}

const paidSchema = z.object({
  method: z.enum(["MPESA", "BANK"]),
  reference: z.string().optional(),
});

export async function markPayoutPaid(payoutId: string, formData: FormData) {
  const user = await requireRole("STAFF");

  const parsed = paidSchema.parse({
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
  });

  await prisma.payout.findFirstOrThrow({ where: { id: payoutId, owner: { orgId: user.orgId } } });
  const payout = await prisma.payout.update({
    where: { id: payoutId },
    data: {
      status: "PAID",
      method: parsed.method,
      reference: parsed.reference,
      paidDate: new Date(),
    },
  });

  await notifyPayoutSent(payout.id);

  revalidatePath("/payouts");
  const month = payout.periodStart.toISOString().slice(0, 7);
  redirect(`/payouts?month=${month}`);
}
