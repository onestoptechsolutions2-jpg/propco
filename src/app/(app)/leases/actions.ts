"use server";

import { prisma } from "@/lib/prisma";
import { getManagedLease, assertPremium } from "@/lib/lease-access";
import { ensureChecklist, computeSettlement } from "@/lib/checklists";
import { notifySettlement } from "@/lib/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ChecklistType } from "@prisma/client";

export async function startChecklist(leaseId: string, type: ChecklistType) {
  const { user } = await getManagedLease(leaseId);
  await assertPremium(user.orgId);
  await ensureChecklist(leaseId, type);
  revalidatePath(`/leases/${leaseId}`);
}

/** Save ticks, conditions, notes and costs for every item on a checklist in one go. */
export async function saveChecklist(leaseId: string, checklistId: string, formData: FormData) {
  const { user } = await getManagedLease(leaseId);
  await assertPremium(user.orgId);

  const checklist = await prisma.checklist.findFirstOrThrow({
    where: { id: checklistId, leaseId },
    include: { items: true },
  });
  if (checklist.completedAt) throw new Error("This checklist is already completed.");

  for (const item of checklist.items) {
    const cost = Number(formData.get(`cost_${item.id}`) || 0);
    const condition = String(formData.get(`condition_${item.id}`) || "") || null;
    await prisma.checklistItem.update({
      where: { id: item.id },
      data: {
        done: formData.get(`done_${item.id}`) === "on",
        condition: item.category === "INVENTORY" ? condition : null,
        notes: String(formData.get(`notes_${item.id}`) || "") || null,
        cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
      },
    });
  }

  const newLabel = String(formData.get("newItem") || "").trim();
  if (newLabel) {
    await prisma.checklistItem.create({
      data: {
        checklistId,
        category: formData.get("newCategory") === "TASK" ? "TASK" : "INVENTORY",
        label: newLabel,
        sortOrder: 500 + checklist.items.length,
        condition: checklist.type === "MOVE_IN" ? "GOOD" : null,
      },
    });
  }

  revalidatePath(`/leases/${leaseId}`);
}

export async function completeMoveIn(leaseId: string) {
  const { user } = await getManagedLease(leaseId);
  await assertPremium(user.orgId);

  const checklist = await prisma.checklist.findUniqueOrThrow({
    where: { leaseId_type: { leaseId, type: "MOVE_IN" } },
    include: { items: true },
  });
  const open = checklist.items.filter((i) => i.category === "TASK" && !i.done);
  if (open.length > 0) {
    throw new Error(`Tick all move-in tasks first. Still open: ${open.map((i) => i.label).join(", ")}.`);
  }

  await prisma.checklist.update({ where: { id: checklist.id }, data: { completedAt: new Date() } });
  revalidatePath(`/leases/${leaseId}`);
}

/**
 * Finish a move-out: settle the deposit, end the lease, free the unit.
 * Deductions = damage/cleaning costs + unpaid utility bills + rent arrears.
 */
export async function completeMoveOut(leaseId: string, formData: FormData) {
  const { user, lease } = await getManagedLease(leaseId);
  await assertPremium(user.orgId);
  if (lease.status !== "ACTIVE") throw new Error("This lease has already ended.");

  const checklist = await prisma.checklist.findUniqueOrThrow({
    where: { leaseId_type: { leaseId, type: "MOVE_OUT" } },
    include: { items: true },
  });
  const open = checklist.items.filter((i) => i.category === "TASK" && !i.done);
  if (open.length > 0) {
    throw new Error(`Tick all move-out tasks first. Still open: ${open.map((i) => i.label).join(", ")}.`);
  }

  const s = await computeSettlement(leaseId);
  const method = String(formData.get("method") || "") || null;
  const ref = String(formData.get("reference") || "") || null;
  const notes = String(formData.get("notes") || "") || null;
  const needsRepairs = formData.get("repairs") === "on" || s.damageItems.length > 0;
  const now = new Date();
  const settleNote = `Settled from deposit on ${now.toISOString().slice(0, 10)}`;

  await prisma.$transaction(async (tx) => {
    // Clear what the deposit covered.
    if (s.unpaidBills.length > 0) {
      await tx.meterReading.updateMany({
        where: { id: { in: s.unpaidBills.map((b) => b.id) } },
        data: { status: "PAID", paidDate: now, notes: settleNote },
      });
    }
    if (s.arrearPayments.length > 0) {
      await tx.payment.updateMany({
        where: { id: { in: s.arrearPayments.map((p) => p.id) } },
        data: { status: "PAID", paidDate: now, notes: settleNote },
      });
    }

    await tx.lease.update({
      where: { id: leaseId },
      data: {
        status: "ENDED",
        endDate: now,
        depositDeductions: s.deductions,
        depositRefund: s.refund,
        depositSettledAt: now,
        depositMethod: method,
        depositRef: ref,
        settlementNotes: notes,
      },
    });
    await tx.checklist.update({ where: { id: checklist.id }, data: { completedAt: now } });

    if (needsRepairs) {
      const damaged = s.damageItems.map((i) => i.label).join(", ");
      await tx.maintenanceRequest.create({
        data: {
          unitId: lease.unitId,
          description: `Move-out repairs${damaged ? `: ${damaged}` : ""}`,
          reportedBy: "Move-out inspection",
          costEstimate: s.damages > 0 ? s.damages : undefined,
        },
      });
    }
    // The tenant's door codes stop working the moment they hand the unit back.
    await tx.accessCode.updateMany({
      where: { unitId: lease.unitId, active: true, bookingId: null },
      data: { active: false, validTo: now },
    });
    await tx.unit.update({
      where: { id: lease.unitId },
      data: { status: needsRepairs ? "MAINTENANCE" : "VACANT" },
    });
  });

  await notifySettlement(leaseId);

  revalidatePath("/leases");
  revalidatePath("/rent");
  revalidatePath("/properties");
  redirect(`/leases/${leaseId}/clearance`);
}
