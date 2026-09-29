"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { assertPremium } from "@/lib/lease-access";
import { generateCode } from "@/lib/access-codes";
import { revalidatePath } from "next/cache";

export async function createAccessCode(formData: FormData) {
  const user = await requireRole("STAFF", "LANDLORD");
  await assertPremium(user.orgId);

  const unitId = String(formData.get("unitId") ?? "");
  const label = String(formData.get("label") ?? "").trim() || "Access";
  const typed = String(formData.get("code") ?? "").replace(/\D/g, "");
  const validToRaw = String(formData.get("validTo") ?? "");

  const unit = await prisma.unit.findFirst({ where: { id: unitId, property: ownerScopeFilter(user) } });
  if (!unit) throw new Error("Choose a unit.");

  await prisma.accessCode.create({
    data: {
      unitId,
      label: label.slice(0, 60),
      code: typed.length >= 4 ? typed.slice(0, 10) : generateCode(),
      validTo: validToRaw ? new Date(`${validToRaw}T23:59:59`) : null,
    },
  });
  revalidatePath("/access");
}

export async function revokeAccessCode(id: string) {
  const user = await requireRole("STAFF", "LANDLORD");
  await prisma.accessCode.updateMany({
    where: { id, unit: { property: ownerScopeFilter(user) } },
    data: { active: false, validTo: new Date() },
  });
  revalidatePath("/access");
}
