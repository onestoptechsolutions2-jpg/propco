"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const ownerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  payoutMethod: z.string().optional(),
  mpesaNumber: z.string().optional(),
  isSelfManaging: z.coerce.boolean().optional(),
});

export async function createOwner(formData: FormData) {
  await requireRole("STAFF");

  const parsed = ownerSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    payoutMethod: formData.get("payoutMethod") || undefined,
    mpesaNumber: formData.get("mpesaNumber") || undefined,
    isSelfManaging: formData.get("isSelfManaging") === "on",
  });

  const owner = await prisma.owner.create({
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/owners");
  redirect(`/owners/${owner.id}`);
}

export async function updateOwner(ownerId: string, formData: FormData) {
  await requireRole("STAFF");

  const parsed = ownerSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    payoutMethod: formData.get("payoutMethod") || undefined,
    mpesaNumber: formData.get("mpesaNumber") || undefined,
    isSelfManaging: formData.get("isSelfManaging") === "on",
  });

  await prisma.owner.update({
    where: { id: ownerId },
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/owners");
  revalidatePath(`/owners/${ownerId}`);
  redirect(`/owners/${ownerId}`);
}

export async function deleteOwner(ownerId: string) {
  await requireRole("STAFF");
  await prisma.owner.delete({ where: { id: ownerId } });
  revalidatePath("/owners");
  redirect("/owners");
}
