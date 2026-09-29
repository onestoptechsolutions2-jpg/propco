"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, canManageOwnerRecords } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyMaintenanceAssigned, notifyMaintenanceResolved } from "@/lib/notify-events";

async function assertCanManageUnit(unitId: string) {
  const user = await requireUser();
  const unit = await prisma.unit.findUniqueOrThrow({
    where: { id: unitId },
    include: { property: true },
  });
  if (!canManageOwnerRecords(user, unit.property.ownerId)) {
    throw new Error("You don't have permission to manage maintenance for this unit.");
  }
  return unit;
}

const createSchema = z.object({
  unitId: z.string().min(1),
  description: z.string().min(1, "Description is required"),
  reportedBy: z.string().optional(),
  costEstimate: z.coerce.number().nonnegative().optional(),
});

export async function createMaintenanceRequest(formData: FormData) {
  const parsed = createSchema.parse({
    unitId: formData.get("unitId"),
    description: formData.get("description"),
    reportedBy: formData.get("reportedBy") || undefined,
    costEstimate: formData.get("costEstimate") || undefined,
  });

  await assertCanManageUnit(parsed.unitId);

  const request = await prisma.maintenanceRequest.create({
    data: parsed,
  });

  revalidatePath("/maintenance");
  redirect(`/maintenance/${request.id}`);
}

const assignSchema = z.object({
  supplierId: z.string().min(1),
  costEstimate: z.coerce.number().nonnegative().optional(),
});

export async function assignSupplier(requestId: string, formData: FormData) {
  await requireRole("STAFF", "LANDLORD");
  const request = await prisma.maintenanceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { unit: { include: { property: true } } },
  });
  const user = await requireUser();
  if (!canManageOwnerRecords(user, request.unit.property.ownerId)) {
    throw new Error("You don't have permission to update this request.");
  }

  const parsed = assignSchema.parse({
    supplierId: formData.get("supplierId"),
    costEstimate: formData.get("costEstimate") || undefined,
  });

  await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: {
      supplierId: parsed.supplierId,
      status: "ASSIGNED",
      costEstimate: parsed.costEstimate,
    },
  });
  await notifyMaintenanceAssigned(requestId);

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${requestId}`);
}

export async function setStatus(
  requestId: string,
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "CANCELLED"
) {
  await requireRole("STAFF", "LANDLORD");
  const request = await prisma.maintenanceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { unit: { include: { property: true } } },
  });
  const user = await requireUser();
  if (!canManageOwnerRecords(user, request.unit.property.ownerId)) {
    throw new Error("You don't have permission to update this request.");
  }

  await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: { status },
  });

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${requestId}`);
}

const completeSchema = z.object({
  actualCost: z.coerce.number().nonnegative(),
});

export async function completeRequest(requestId: string, formData: FormData) {
  await requireRole("STAFF", "LANDLORD");
  const request = await prisma.maintenanceRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { unit: { include: { property: true } } },
  });
  const user = await requireUser();
  if (!canManageOwnerRecords(user, request.unit.property.ownerId)) {
    throw new Error("You don't have permission to update this request.");
  }

  const parsed = completeSchema.parse({ actualCost: formData.get("actualCost") });

  await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: { status: "DONE", actualCost: parsed.actualCost, completedAt: new Date() },
  });
  await notifyMaintenanceResolved(requestId);

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${requestId}`);
}
