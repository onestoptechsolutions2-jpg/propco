"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const paymentSchema = z.object({
  amount: z.coerce.number().nonnegative(),
  dueDate: z.string().min(1),
  paidDate: z.string().optional(),
  method: z.enum(["MPESA", "BANK", "CASH", "CARD"]),
  status: z.enum(["PENDING", "PAID", "LATE", "FAILED"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function recordPayment(leaseId: string, formData: FormData) {
  const user = await requireUser();
  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id: leaseId },
    include: { unit: { include: { property: true } } },
  });

  if (!canManageOwnerRecords(user, lease.unit.property.ownerId)) {
    throw new Error("You don't have permission to record a payment for this lease.");
  }

  const parsed = paymentSchema.parse({
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate"),
    paidDate: formData.get("paidDate") || undefined,
    method: formData.get("method"),
    status: formData.get("status"),
    reference: formData.get("reference") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await prisma.payment.create({
    data: {
      leaseId,
      amount: parsed.amount,
      dueDate: new Date(parsed.dueDate),
      paidDate: parsed.paidDate ? new Date(parsed.paidDate) : undefined,
      method: parsed.method,
      status: parsed.status,
      reference: parsed.reference,
      notes: parsed.notes,
    },
  });

  revalidatePath("/rent");
  revalidatePath(`/rent/${leaseId}`);
  redirect(`/rent/${leaseId}`);
}

export async function markPaymentPaid(leaseId: string, paymentId: string) {
  const user = await requireUser();
  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id: leaseId },
    include: { unit: { include: { property: true } } },
  });

  if (!canManageOwnerRecords(user, lease.unit.property.ownerId)) {
    throw new Error("You don't have permission to update this payment.");
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PAID", paidDate: new Date() },
  });

  revalidatePath("/rent");
  revalidatePath(`/rent/${leaseId}`);
}
