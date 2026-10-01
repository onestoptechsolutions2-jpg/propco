"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { notifyInvoice } from "@/lib/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const round2 = (n: number) => Math.round(n * 100) / 100;
const VAT_RATE = 0.16; // Kenya standard rate
const back: (q?: string) => never = (q = "") => redirect(`/invoices${q}`);

type User = Awaited<ReturnType<typeof requireRole>>;

/** Invoices this user may act on: everything in the company, or (landlords) only their own repairs. */
function invoiceScope(user: User, id: string) {
  return {
    id,
    orgId: user.orgId,
    ...(user.role === "LANDLORD" ? { request: { unit: { property: ownerScopeFilter(user) } } } : {}),
  };
}

const schema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  requestId: z.string().optional(),
  description: z.string().trim().min(3, "Describe what the invoice is for"),
  number: z.string().optional(),
  amount: z.coerce.number().positive("Enter the amount"),
  dueDate: z.string().optional(),
});

export async function createInvoice(formData: FormData) {
  const user = await requireRole("STAFF", "LANDLORD");
  const parsed = schema.safeParse({
    supplierId: formData.get("supplierId"),
    requestId: formData.get("requestId") || undefined,
    description: formData.get("description"),
    number: formData.get("number") || undefined,
    amount: formData.get("amount"),
    dueDate: formData.get("dueDate") || undefined,
  });
  if (!parsed.success) back("?error=" + encodeURIComponent(parsed.error.issues[0].message));
  const d = parsed.data!;

  const supplier = await prisma.supplier.findFirst({ where: { id: d.supplierId, orgId: user.orgId } });
  if (!supplier) back("?error=" + encodeURIComponent("Unknown supplier."));

  if (d.requestId) {
    const req = await prisma.maintenanceRequest.findFirst({
      where: { id: d.requestId, unit: { property: ownerScopeFilter(user) } },
    });
    if (!req) back("?error=" + encodeURIComponent("You can't attach that repair."));
    if (req!.supplierId && req!.supplierId !== d.supplierId) {
      back("?error=" + encodeURIComponent("That repair was assigned to a different supplier."));
    }
  } else if (user.role === "LANDLORD") {
    back("?error=" + encodeURIComponent("Attach the repair this invoice is for."));
  }

  const vat = formData.get("addVat") === "on" ? round2(d.amount * VAT_RATE) : 0;
  await prisma.supplierInvoice.create({
    data: {
      orgId: user.orgId,
      supplierId: d.supplierId,
      requestId: d.requestId,
      description: d.description,
      number: d.number,
      amount: d.amount,
      vat,
      total: round2(d.amount + vat),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
    },
  });
  revalidatePath("/invoices");
  back("?added=1");
}

export async function approveInvoice(id: string) {
  const user = await requireRole("STAFF", "LANDLORD");
  const inv = await prisma.supplierInvoice.findFirst({ where: invoiceScope(user, id), include: { request: true } });
  if (!inv || inv.status !== "SUBMITTED") return;

  // Approval limit: big invoices need an admin (or the landlord themself).
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  if (org.approvalLimit && Number(inv.total) > Number(org.approvalLimit) && user.role === "STAFF") {
    back("?error=" + encodeURIComponent(`Invoices over KES ${Number(org.approvalLimit).toLocaleString()} need an admin to approve.`));
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplierInvoice.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
    // Charge the repair cost to the owner via the linked repair (feeds owner payouts).
    if (inv.request && inv.request.actualCost === null) {
      await tx.maintenanceRequest.update({ where: { id: inv.request.id }, data: { actualCost: inv.total } });
    }
  });
  await notifyInvoice(id, "APPROVED");
  revalidatePath("/invoices");
  back();
}

export async function rejectInvoice(id: string, formData: FormData) {
  const user = await requireRole("STAFF", "LANDLORD");
  const inv = await prisma.supplierInvoice.findFirst({ where: invoiceScope(user, id) });
  if (!inv || inv.status !== "SUBMITTED") return;
  await prisma.supplierInvoice.update({
    where: { id },
    data: { status: "REJECTED", reviewNote: String(formData.get("note") ?? "").trim() || null },
  });
  await notifyInvoice(id, "REJECTED");
  revalidatePath("/invoices");
}

export async function payInvoice(id: string, formData: FormData) {
  const user = await requireRole("STAFF", "LANDLORD");
  const inv = await prisma.supplierInvoice.findFirst({ where: invoiceScope(user, id) });
  if (!inv || inv.status !== "APPROVED") return;
  const method = String(formData.get("method") ?? "MPESA");
  const payMethod = ["MPESA", "BANK", "CASH"].includes(method) ? method : "MPESA";
  const payRef = String(formData.get("reference") ?? "").trim() || null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.supplierInvoice.update({ where: { id }, data: { status: "PAID", paidAt: now, payMethod, payRef } });
    // Keep the repair-based "Pay suppliers" list in step so it isn't paid twice.
    if (inv.requestId) {
      await tx.maintenanceRequest.updateMany({
        where: { id: inv.requestId, supplierPaidAt: null },
        data: { supplierPaidAt: now, supplierPayMethod: payMethod, supplierPayRef: payRef },
      });
    }
  });
  await notifyInvoice(id, "PAID");
  revalidatePath("/invoices");
  revalidatePath("/supplier-payments");
}

export async function deleteInvoice(id: string) {
  const user = await requireRole("STAFF", "LANDLORD");
  await prisma.supplierInvoice.deleteMany({ where: { ...invoiceScope(user, id), status: { in: ["SUBMITTED", "REJECTED"] } } });
  revalidatePath("/invoices");
}
