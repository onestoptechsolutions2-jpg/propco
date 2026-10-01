"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { orgHasPremium } from "@/lib/lease-access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const tenantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notifyChannel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).optional(),
  idNumber: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
});

export async function createTenant(formData: FormData) {
  const user = await requirePermission("tenants.manage");

  const parsed = tenantSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    notifyChannel: formData.get("notifyChannel") || undefined,
    idNumber: formData.get("idNumber") || undefined,
    emergencyName: formData.get("emergencyName") || undefined,
    emergencyPhone: formData.get("emergencyPhone") || undefined,
  });

  const tenant = await prisma.tenant.create({
    data: { ...parsed, email: parsed.email || undefined, orgId: user.orgId },
  });

  revalidatePath("/tenants");
  redirect(`/tenants/${tenant.id}/edit`);
}

export async function updateTenant(tenantId: string, formData: FormData) {
  const user = await requirePermission("tenants.manage");

  const parsed = tenantSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    notifyChannel: formData.get("notifyChannel") || undefined,
    idNumber: formData.get("idNumber") || undefined,
    emergencyName: formData.get("emergencyName") || undefined,
    emergencyPhone: formData.get("emergencyPhone") || undefined,
  });

  await prisma.tenant.update({
    where: { id: tenantId, orgId: user.orgId },
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function deleteTenant(tenantId: string) {
  const user = await requirePermission("tenants.manage");
  await prisma.tenant.delete({ where: { id: tenantId, orgId: user.orgId } });
  revalidatePath("/tenants");
  redirect("/tenants");
}

const leaseSchema = z.object({
  unitId: z.string().min(1),
  tenantId: z.string().min(1),
  startDate: z.string().min(1),
  rentAmount: z.coerce.number().nonnegative(),
  depositAmount: z.coerce.number().nonnegative().optional(),
});

export async function createLease(formData: FormData) {
  const user = await requirePermission("tenants.manage");

  const parsed = leaseSchema.parse({
    unitId: formData.get("unitId"),
    tenantId: formData.get("tenantId"),
    startDate: formData.get("startDate"),
    rentAmount: formData.get("rentAmount"),
    depositAmount: formData.get("depositAmount") || undefined,
  });

  // Both the tenant and the unit must belong to the caller's company (and,
  // for landlords, their own property).
  const [tenant, unit] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: parsed.tenantId, orgId: user.orgId } }),
    prisma.unit.findFirst({ where: { id: parsed.unitId, property: ownerScopeFilter(user) } }),
  ]);
  if (!tenant || !unit) throw new Error("You don't have permission to create this lease.");

  const [createdLease] = await prisma.$transaction([
    prisma.lease.create({
      data: {
        unitId: parsed.unitId,
        tenantId: parsed.tenantId,
        startDate: new Date(parsed.startDate),
        rentAmount: parsed.rentAmount,
        depositAmount: parsed.depositAmount,
      },
    }),
    prisma.unit.update({ where: { id: parsed.unitId }, data: { status: "OCCUPIED" } }),
  ]);

  revalidatePath("/tenants");
  // Straight into onboarding: the move-in checklist for this new lease.
  redirect((await orgHasPremium(user.orgId)) ? `/leases/${createdLease.id}` : "/tenants");
}
