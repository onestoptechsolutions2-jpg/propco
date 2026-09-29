"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifySupplierPaid } from "@/lib/notify-events";

const paidSchema = z.object({
  method: z.enum(["MPESA", "BANK"]),
  reference: z.string().optional(),
});

export async function markSupplierPaid(requestId: string, formData: FormData) {
  await requireRole("STAFF");

  const parsed = paidSchema.parse({
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
  });

  const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "DONE" || !request.supplierId) {
    throw new Error("Only completed, supplier-assigned jobs can be paid.");
  }
  if (request.supplierPaidAt) redirect("/supplier-payments");

  await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: {
      supplierPaidAt: new Date(),
      supplierPayMethod: parsed.method,
      supplierPayRef: parsed.reference,
    },
  });

  await notifySupplierPaid(requestId);

  revalidatePath("/supplier-payments");
  redirect("/supplier-payments");
}
