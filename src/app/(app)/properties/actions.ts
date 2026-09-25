"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const propertySchema = z.object({
  name: z.string().min(1, "Name is required"),
  addressLine1: z.string().min(1, "Address is required"),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  type: z.enum(["SINGLE_UNIT", "BUILDING"]),
  managementMode: z.enum(["AGENCY_MANAGED", "SELF_MANAGED"]),
  ownerId: z.string().min(1, "Owner is required"),
});

export async function createProperty(formData: FormData) {
  const user = await requireUser();

  const parsed = propertySchema.parse({
    name: formData.get("name"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || undefined,
    city: formData.get("city") || undefined,
    type: formData.get("type"),
    managementMode: formData.get("managementMode"),
    ownerId: formData.get("ownerId"),
  });

  if (!canManageOwnerRecords(user, parsed.ownerId)) {
    throw new Error("You don't have permission to add a property for this owner.");
  }

  const property = await prisma.property.create({
    data: parsed,
  });

  // A single-unit property gets one unit auto-created, per the spec.
  if (parsed.type === "SINGLE_UNIT") {
    await prisma.unit.create({
      data: {
        propertyId: property.id,
        label: "Main Unit",
        rentAmount: 0,
      },
    });
  }

  revalidatePath("/properties");
  redirect(`/properties/${property.id}`);
}

export async function updateProperty(propertyId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });

  if (!canManageOwnerRecords(user, existing.ownerId)) {
    throw new Error("You don't have permission to edit this property.");
  }

  const parsed = propertySchema.parse({
    name: formData.get("name"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || undefined,
    city: formData.get("city") || undefined,
    type: formData.get("type"),
    managementMode: formData.get("managementMode"),
    ownerId: formData.get("ownerId"),
  });

  if (!canManageOwnerRecords(user, parsed.ownerId)) {
    throw new Error("You don't have permission to reassign this property to that owner.");
  }

  await prisma.property.update({ where: { id: propertyId }, data: parsed });

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function deleteProperty(propertyId: string) {
  const user = await requireUser();
  const existing = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });

  if (!canManageOwnerRecords(user, existing.ownerId)) {
    throw new Error("You don't have permission to delete this property.");
  }

  await prisma.property.delete({ where: { id: propertyId } });
  revalidatePath("/properties");
  redirect("/properties");
}

const unitSchema = z.object({
  label: z.string().min(1, "Label is required"),
  bedrooms: z.coerce.number().int().nonnegative().optional(),
  bathrooms: z.coerce.number().int().nonnegative().optional(),
  rentAmount: z.coerce.number().nonnegative(),
});

export async function createUnit(propertyId: string, formData: FormData) {
  const user = await requireUser();
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });

  if (!canManageOwnerRecords(user, property.ownerId)) {
    throw new Error("You don't have permission to add a unit to this property.");
  }

  const parsed = unitSchema.parse({
    label: formData.get("label"),
    bedrooms: formData.get("bedrooms") || undefined,
    bathrooms: formData.get("bathrooms") || undefined,
    rentAmount: formData.get("rentAmount"),
  });

  await prisma.unit.create({ data: { ...parsed, propertyId } });

  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function updateUnitStatus(
  propertyId: string,
  unitId: string,
  status: "VACANT" | "OCCUPIED" | "MAINTENANCE"
) {
  const user = await requireUser();
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });

  if (!canManageOwnerRecords(user, property.ownerId)) {
    throw new Error("You don't have permission to update this unit.");
  }

  await prisma.unit.update({ where: { id: unitId }, data: { status } });
  revalidatePath(`/properties/${propertyId}`);
}
