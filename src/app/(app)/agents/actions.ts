"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/access";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const agentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  mpesaNumber: z.string().optional(),
  kind: z.enum(["LEASING", "REFERRAL"]),
  basis: z.enum(["PERCENT_OF_FIRST_RENT", "FLAT"]),
  rate: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

function read(formData: FormData) {
  return agentSchema.parse({
    name: String(formData.get("name") ?? "").trim(),
    phone: formData.get("phone") || undefined,
    mpesaNumber: formData.get("mpesaNumber") || undefined,
    kind: formData.get("kind") || "LEASING",
    basis: formData.get("basis") || "PERCENT_OF_FIRST_RENT",
    rate: formData.get("rate") || 0,
    notes: formData.get("notes") || undefined,
  });
}

export async function createAgent(formData: FormData) {
  const user = await requirePermission("agents.manage");
  const data = read(formData);
  const agent = await prisma.agent.create({ data: { ...data, orgId: user.orgId } });
  await audit(user, "agent.create", agent.name);
  revalidatePath("/agents");
  redirect(`/agents/${agent.id}`);
}

export async function updateAgent(id: string, formData: FormData) {
  const user = await requirePermission("agents.manage");
  const data = read(formData);
  const found = await prisma.agent.findFirst({ where: { id, orgId: user.orgId } });
  if (!found) throw new Error("Agent not found.");
  // Changing terms only affects leases created from now on; commissions already
  // fixed on a lease keep the amount agreed at the time.
  await prisma.agent.update({
    where: { id },
    data: { ...data, active: formData.get("active") === "on" },
  });
  await audit(user, "agent.update", found.name);
  revalidatePath(`/agents/${id}`);
  redirect(`/agents/${id}`);
}

/** Pay one lease's commission: marks it paid and writes the cash-book entry. */
export async function payCommission(formData: FormData) {
  const user = await requirePermission("agents.manage");
  const leaseId = String(formData.get("leaseId") ?? "");
  const method = String(formData.get("method") ?? "MPESA");
  const ref = String(formData.get("ref") ?? "").trim() || null;
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, agent: { orgId: user.orgId }, agentCommissionPaidAt: null },
    include: { agent: true },
  });
  if (!lease || !lease.agent || !lease.agentCommission) redirect("/agents");
  const l = lease!;
  const now = new Date();
  // Claim first so a double click cannot pay twice.
  const claimed = await prisma.lease.updateMany({
    where: { id: l.id, agentCommissionPaidAt: null },
    data: { agentCommissionPaidAt: now, agentCommissionMethod: method, agentCommissionRef: ref },
  });
  if (claimed.count === 1) {
    await prisma.ledgerEntry.create({
      data: {
        orgId: user.orgId,
        kind: "OUT",
        amount: l.agentCommission!,
        category: "Agent commission",
        note: `Commission to ${l.agent!.name}${ref ? ` (${ref})` : ""}`,
        method,
        date: now,
        createdById: user.id,
      },
    });
    await audit(user, "agent.pay", `${l.agent!.name} KES ${l.agentCommission}`);
  }
  revalidatePath("/agents");
  revalidatePath("/books");
  redirect(`/agents/${l.agentId}`);
}
