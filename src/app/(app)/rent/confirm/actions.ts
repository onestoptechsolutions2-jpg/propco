"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { parseMpesaMessage } from "@/lib/mpesa-parse";
import { notifyPaymentReceived } from "@/lib/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const round2 = (n: number) => Math.round(n * 100) / 100;
const back: (q?: string) => never = (q = "") => redirect(`/rent/confirm${q}`);

/** Staff paste the M-Pesa confirmation the tenant forwarded (WhatsApp, SMS, screenshot text). */
export async function submitProof(formData: FormData) {
  const user = await requirePermission("rent.manage");
  const raw = String(formData.get("message") ?? "").trim();
  if (raw.length < 10) back("?error=" + encodeURIComponent("Paste the full M-Pesa message first."));

  const p = parseMpesaMessage(raw);

  if (p.code) {
    const dup = await prisma.paymentProof.findUnique({ where: { orgId_code: { orgId: user.orgId, code: p.code } } });
    if (dup) back("?error=" + encodeURIComponent(`Code ${p.code} was already submitted (${dup.status.toLowerCase()}).`));
  }

  await prisma.paymentProof.create({
    data: {
      orgId: user.orgId,
      rawMessage: raw,
      code: p.code,
      amount: p.amount,
      payerName: p.payerName,
      payerPhone: p.payerPhone,
    },
  });
  revalidatePath("/rent/confirm");
  revalidatePath("/", "layout");
  back("?added=1");
}

/** Turn a proof into a PAID rent payment on the chosen lease. */
export async function approveProof(proofId: string, formData: FormData) {
  const user = await requirePermission("rent.manage");

  const proof = await prisma.paymentProof.findFirst({
    where: { id: proofId, orgId: user.orgId, status: "PENDING" },
  });
  if (!proof) back("?error=" + encodeURIComponent("That message was already handled."));
  const p = proof!;

  const leaseId = String(formData.get("leaseId") ?? "");
  const amount = round2(Number(formData.get("amount")));
  const code = String(formData.get("code") ?? "").trim().toUpperCase() || p.code;
  if (!leaseId) back("?error=" + encodeURIComponent("Choose which tenant this payment is for."));
  if (!Number.isFinite(amount) || amount <= 0) back("?error=" + encodeURIComponent("Enter the amount received."));
  if (!code) back("?error=" + encodeURIComponent("Enter the M-Pesa transaction code."));

  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, status: "ACTIVE", unit: { property: ownerScopeFilter(user) } },
  });
  if (!lease) back("?error=" + encodeURIComponent("That tenant was not found."));

  // The same M-Pesa code must never pay rent twice.
  const used = await prisma.payment.findFirst({
    where: { reference: code!, lease: { unit: { property: { orgId: user.orgId } } } },
  });
  if (used) back("?error=" + encodeURIComponent(`Code ${code} is already recorded against a payment.`));

  const now = new Date();
  const due = await prisma.payment.findFirst({
    where: { leaseId, status: { in: ["PENDING", "LATE", "FAILED"] } },
    orderBy: { dueDate: "asc" },
  });

  let paymentId: string;
  if (due) {
    const owed = Number(due.amount);
    const note =
      amount < owed
        ? `Part payment: KES ${amount} of ${owed}; balance ${round2(owed - amount)}`
        : amount > owed
          ? `Overpaid by KES ${round2(amount - owed)}`
          : null;
    const updated = await prisma.payment.update({
      where: { id: due.id },
      data: {
        status: "PAID",
        paidDate: now,
        method: "MPESA",
        reference: code!,
        amount: amount < owed ? amount : due.amount,
        notes: [due.notes, note, "Confirmed from M-Pesa message"].filter(Boolean).join(" | "),
      },
    });
    paymentId = updated.id;
  } else {
    const created = await prisma.payment.create({
      data: {
        leaseId,
        amount,
        dueDate: now,
        paidDate: now,
        method: "MPESA",
        status: "PAID",
        reference: code!,
        notes: "Confirmed from M-Pesa message (no rent was outstanding)",
      },
    });
    paymentId = created.id;
  }

  await prisma.paymentProof.update({
    where: { id: p.id },
    data: { status: "APPROVED", leaseId, paymentId, code, amount, reviewedAt: now },
  });
  await notifyPaymentReceived(paymentId);

  revalidatePath("/rent");
  revalidatePath("/rent/confirm");
  revalidatePath("/", "layout");
  back("?approved=1");
}

export async function rejectProof(proofId: string, formData: FormData) {
  const user = await requirePermission("rent.manage");
  await prisma.paymentProof.updateMany({
    where: { id: proofId, orgId: user.orgId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewNote: String(formData.get("note") ?? "").trim() || null,
      reviewedAt: new Date(),
    },
  });
  revalidatePath("/rent/confirm");
  revalidatePath("/", "layout");
  back();
}
