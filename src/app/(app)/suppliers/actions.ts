"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  trade: z.enum(["PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER", "GENERAL", "OTHER"]),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  rate: z.coerce.number().nonnegative().optional(),
  payoutMethod: z.string().optional(),
  mpesaNumber: z.string().optional(),
});

function parseSupplier(formData: FormData) {
  return supplierSchema.parse({
    name: formData.get("name"),
    trade: formData.get("trade"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    rate: formData.get("rate") || undefined,
    payoutMethod: formData.get("payoutMethod") || undefined,
    mpesaNumber: formData.get("mpesaNumber") || undefined,
  });
}

export async function createSupplier(formData: FormData) {
  await requireRole("STAFF", "LANDLORD");
  const parsed = parseSupplier(formData);

  await prisma.supplier.create({
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(supplierId: string, formData: FormData) {
  await requireRole("STAFF", "LANDLORD");
  const parsed = parseSupplier(formData);

  await prisma.supplier.update({
    where: { id: supplierId },
    data: { ...parsed, email: parsed.email || undefined },
  });

  revalidatePath("/suppliers");
  redirect(`/suppliers`);
}

export async function deleteSupplier(supplierId: string) {
  await requireRole("STAFF", "LANDLORD");
  await prisma.supplier.delete({ where: { id: supplierId } });
  revalidatePath("/suppliers");
  redirect("/suppliers");
}
