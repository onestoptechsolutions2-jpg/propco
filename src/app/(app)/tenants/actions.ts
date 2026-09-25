"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const tenantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});

export async function createTenant(formData: FormData) {
  await requireRole("STAFF", "LANDLORD");

  const parsed = tenantSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });

  const tenant = await prisma.tenant.create({
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/tenants");
  redirect(`/tenants/${tenant.id}/edit`);
}

export async function updateTenant(tenantId: string, formData: FormData) {
  await requireRole("STAFF", "LANDLORD");

  const parsed = tenantSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function deleteTenant(tenantId: string) {
  await requireRole("STAFF", "LANDLORD");
  await prisma.tenant.delete({ where: { id: tenantId } });
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
  await requireRole("STAFF", "LANDLORD");

  const parsed = leaseSchema.parse({
    unitId: formData.get("unitId"),
    tenantId: formData.get("tenantId"),
    startDate: formData.get("startDate"),
    rentAmount: formData.get("rentAmount"),
    depositAmount: formData.get("depositAmount") || undefined,
  });

  await prisma.$transaction([
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
  redirect("/tenants");
}
