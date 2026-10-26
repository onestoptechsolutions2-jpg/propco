"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requirePermission, canManageOwnerRecords, ownerScopeFilter } from "@/lib/access";
import { audit } from "@/lib/audit";
import { interpret, type ChatData, type ChatOption } from "@/lib/chat";
import { notifyPaymentReceived } from "@/lib/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

const KES = (n: number) => `KES ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function say(orgId: string, userId: string, text: string, data?: ChatData) {
  await prisma.chatMessage.create({
    data: { orgId, userId, fromApp: true, text, data: (data as Prisma.InputJsonValue) ?? undefined },
  });
}

/** The user typed (or tapped a suggestion): save it, work out what they mean, answer. */
export async function sendMessage(formData: FormData) {
  const user = await requireUser();
  const text = String(formData.get("text") ?? "").trim().slice(0, 500);
  if (!text) redirect("/chat");
  await prisma.chatMessage.create({ data: { orgId: user.orgId, userId: user.id!, text } });
  const reply = await interpret(user, text);
  await say(user.orgId, user.id!, reply.text, reply.data);
  revalidatePath("/chat");
  redirect("/chat");
}

/** The user tapped one of the app's choices. Everything is re-validated here, never trusted from the stored bubble. */
export async function chooseOption(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const index = Number(formData.get("index"));
  const msg = await prisma.chatMessage.findFirst({
    where: { id, orgId: user.orgId, userId: user.id!, fromApp: true, resolved: false },
  });
  const opt = (msg?.data as ChatData | null)?.options?.[index];
  if (!msg || !opt) redirect("/chat");

  // Claim the bubble first so a double tap can't record twice.
  const claimed = await prisma.chatMessage.updateMany({ where: { id, resolved: false }, data: { resolved: true } });
  if (claimed.count === 0) redirect("/chat");

  let result: string;
  try {
    result = await execute(user, opt!);
  } catch (e) {
    result = "Sorry, I couldn't do that: " + (e instanceof Error ? e.message : "unknown error");
    await prisma.chatMessage.update({ where: { id }, data: { resolved: false } });
  }
  await prisma.chatMessage.create({ data: { orgId: user.orgId, userId: user.id!, text: opt!.label.split(" · ")[0] } });
  await say(user.orgId, user.id!, result);
  revalidatePath("/chat");
  redirect("/chat");
}

export async function dismissOptions(formData: FormData) {
  const user = await requireUser();
  await prisma.chatMessage.updateMany({
    where: { id: String(formData.get("id") ?? ""), orgId: user.orgId, userId: user.id!, fromApp: true },
    data: { resolved: true },
  });
  await say(user.orgId, user.id!, "Okay, cancelled.");
  redirect("/chat");
}

type U = Awaited<ReturnType<typeof requireUser>>;

async function execute(user: U, opt: ChatOption): Promise<string> {
  if (opt.type === "RENT") {
    await requirePermission("rent.manage");
    const lease = await prisma.lease.findFirst({
      where: { id: opt.leaseId, unit: { property: { orgId: user.orgId } } },
      include: { tenant: true, unit: { include: { property: true } } },
    });
    if (!lease || !canManageOwnerRecords(user, lease.unit.property.ownerId, lease.unit.property.orgId)) {
      throw new Error("that tenant isn't available to you");
    }
    const now = new Date();
    let paymentId = opt.paymentId;
    const open = paymentId
      ? await prisma.payment.findFirst({ where: { id: paymentId, leaseId: lease.id, status: { in: ["PENDING", "LATE"] } } })
      : null;
    if (open) {
      await prisma.payment.update({
        where: { id: open.id },
        data: { status: "PAID", paidDate: now, amount: opt.amount, method: opt.method, reference: opt.reference },
      });
    } else {
      paymentId = (
        await prisma.payment.create({
          data: { leaseId: lease.id, amount: opt.amount, dueDate: now, paidDate: now, method: opt.method, status: "PAID", reference: opt.reference },
        })
      ).id;
    }
    await notifyPaymentReceived(open?.id ?? paymentId!);
    await audit(user, "rent.record", `${lease.tenant.name} ${KES(opt.amount)} via chat`);
    return `✓ Recorded ${KES(opt.amount)} from ${lease.tenant.name} (${lease.unit.label}). A receipt is ready under Collect rent.`;
  }

  if (opt.type === "REPAIR") {
    await requirePermission("maintenance.manage");
    const unit = await prisma.unit.findFirst({ where: { id: opt.unitId }, include: { property: true } });
    if (!unit || !canManageOwnerRecords(user, unit.property.ownerId, unit.property.orgId)) throw new Error("that unit isn't available to you");
    const req = await prisma.maintenanceRequest.create({
      data: { unitId: unit.id, description: opt.description.slice(0, 500), reportedBy: user.name ?? "Chat" },
    });
    await audit(user, "repair.create", `${unit.label} via chat`);
    return `✓ Repair logged for ${unit.property.name} ${unit.label}. Open it at /maintenance/${req.id} to assign a supplier.`;
  }

  if (opt.type === "TENANT") {
    await requirePermission("tenants.manage");
    const name = opt.name.trim().slice(0, 100);
    if (!name) throw new Error("name is missing");
    const t = await prisma.tenant.create({ data: { orgId: user.orgId, name, phone: opt.phone } });
    await audit(user, "tenant.create", `${name} via chat`);
    return `✓ Added ${t.name}. Say "Move ${t.name.split(" ")[0]} into 4B" when they are ready to move in.`;
  }

  if (opt.type === "MOVE_IN") {
    await requirePermission("tenants.manage");
    const [tenant, unit] = await Promise.all([
      prisma.tenant.findFirst({ where: { id: opt.tenantId, orgId: user.orgId } }),
      prisma.unit.findFirst({ where: { id: opt.unitId, status: "VACANT", property: ownerScopeFilter(user) }, include: { property: true } }),
    ]);
    if (!tenant || !unit) throw new Error("that unit is no longer vacant or isn't available to you");
    if (!(opt.rent >= 0)) throw new Error("invalid rent");
    const [lease] = await prisma.$transaction([
      prisma.lease.create({
        data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date(), rentAmount: opt.rent, depositAmount: opt.deposit },
      }),
      prisma.unit.update({ where: { id: unit.id }, data: { status: "OCCUPIED" } }),
    ]);
    await audit(user, "lease.create", `${tenant.name} → ${unit.label} via chat`);
    return `✓ ${tenant.name} is now in ${unit.property.name} ${unit.label} at ${KES(opt.rent)}/month. Finish the move-in checklist at /leases/${lease.id}.`;
  }

  if (opt.type === "INVOICE") {
    const u = await requirePermission("invoices.manage");
    if (u.role === "LANDLORD") throw new Error("attach landlord invoices to a repair on the invoices page");
    const supplier = await prisma.supplier.findFirst({ where: { id: opt.supplierId, orgId: user.orgId } });
    if (!supplier) throw new Error("unknown supplier");
    if (!(opt.amount > 0)) throw new Error("invalid amount");
    await prisma.supplierInvoice.create({
      data: { orgId: user.orgId, supplierId: supplier.id, description: opt.description || "Supplier invoice", amount: opt.amount, total: opt.amount },
    });
    await audit(user, "invoice.create", `${supplier.name} ${KES(opt.amount)} via chat`);
    return `✓ Invoice from ${supplier.name} for ${KES(opt.amount)} added. It's waiting for approval under Supplier invoices.`;
  }

  await requirePermission("books.manage");
  await prisma.ledgerEntry.create({
    data: { orgId: user.orgId, kind: opt.kind, amount: opt.amount, category: opt.category, note: opt.note, createdById: user.id },
  });
  await audit(user, "books.add", `${opt.kind} ${KES(opt.amount)} via chat`);
  return `✓ Added to your books: ${opt.kind === "IN" ? "+" : "−"}${KES(opt.amount)} (${opt.category}).`;
}
