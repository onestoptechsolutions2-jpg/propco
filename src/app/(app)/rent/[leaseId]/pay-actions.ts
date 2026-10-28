"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, canManageOwnerRecords } from "@/lib/access";
import { audit } from "@/lib/audit";
import { startPayment, type Provider } from "@/lib/payments/start";

/** Ask a tenant to pay rent now: an M-Pesa prompt on their phone, or a card/bank link to send them. */
export async function requestRentPayment(leaseId: string, formData: FormData) {
  const user = await requirePermission("rent.manage");
  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id: leaseId },
    include: { tenant: true, unit: { include: { property: true } } },
  });
  if (!canManageOwnerRecords(user, lease.unit.property.ownerId, lease.unit.property.orgId)) {
    throw new Error("You don't have permission to request a payment for this lease.");
  }

  const provider = String(formData.get("provider")) === "FLUTTERWAVE" ? "FLUTTERWAVE" : "MPESA";
  const amount = Number(formData.get("amount"));
  const phone = String(formData.get("phone") ?? "").trim() || lease.tenant.phone;
  const open = await prisma.payment.findFirst({
    where: { leaseId, status: { in: ["PENDING", "LATE"] } },
    orderBy: { dueDate: "asc" },
  });

  let result: string;
  try {
    const intent = await startPayment({
      orgId: user.orgId,
      purpose: "RENT",
      provider: provider as Provider,
      amount,
      phone,
      payer: { name: lease.tenant.name, email: lease.tenant.email },
      description: "Rent",
      reference: lease.unit.label,
      createdById: user.id,
      leaseId,
      paymentId: open?.id,
    });
    await audit(user, "payment.request", `${lease.tenant.name} KES ${amount} via ${provider}`);
    result = intent.provider === "MPESA" ? "requested=mpesa" : "requested=link";
  } catch (e) {
    result = "payError=" + encodeURIComponent(e instanceof Error ? e.message : "Could not start the payment.");
  }
  revalidatePath(`/rent/${leaseId}`);
  redirect(`/rent/${leaseId}?${result}`);
}
