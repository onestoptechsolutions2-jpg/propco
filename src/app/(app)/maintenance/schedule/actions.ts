"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const TEMPLATES: { title: string; months: number }[] = [
  { title: "Water tank cleaning", months: 6 },
  { title: "Fire extinguisher check", months: 12 },
  { title: "Generator service", months: 3 },
  { title: "Gutters and roof inspection", months: 12 },
  { title: "Pest control", months: 6 },
  { title: "Lift service", months: 3 },
  { title: "Electrical safety check", months: 24 },
  { title: "Septic tank / drainage emptying", months: 12 },
];

function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

const schema = z.object({
  propertyId: z.string().min(1),
  title: z.string().trim().min(2, "Give the job a name"),
  intervalMonths: z.coerce.number().int().min(1).max(120),
  nextDue: z.string().min(1),
  estimatedCost: z.coerce.number().nonnegative().optional(),
  supplierId: z.string().optional(),
});

async function ownProperty(user: Awaited<ReturnType<typeof requireRole>>, propertyId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, ...ownerScopeFilter(user) } });
  if (!property) throw new Error("You don't have permission for this property.");
  return property;
}

export async function addSchedule(formData: FormData) {
  const user = await requireRole("STAFF", "LANDLORD");
  const parsed = schema.parse({
    propertyId: formData.get("propertyId"),
    title: formData.get("title"),
    intervalMonths: formData.get("intervalMonths"),
    nextDue: formData.get("nextDue"),
    estimatedCost: formData.get("estimatedCost") || undefined,
    supplierId: formData.get("supplierId") || undefined,
  });
  await ownProperty(user, parsed.propertyId);
  if (parsed.supplierId) {
    const s = await prisma.supplier.findFirst({ where: { id: parsed.supplierId, orgId: user.orgId } });
    if (!s) throw new Error("Unknown supplier.");
  }
  await prisma.maintenanceSchedule.create({
    data: { ...parsed, nextDue: new Date(parsed.nextDue) },
  });
  revalidatePath("/maintenance/schedule");
  redirect("/maintenance/schedule");
}

/** Add the standard set of recurring jobs to a property in one tap. */
export async function addTemplates(formData: FormData) {
  const user = await requireRole("STAFF", "LANDLORD");
  const propertyId = String(formData.get("propertyId") ?? "");
  await ownProperty(user, propertyId);

  const existing = await prisma.maintenanceSchedule.findMany({ where: { propertyId }, select: { title: true } });
  const have = new Set(existing.map((e) => e.title));
  const first = addMonths(new Date(), 1);
  const rows = TEMPLATES.filter((t) => !have.has(t.title)).map((t) => ({
    propertyId,
    title: t.title,
    intervalMonths: t.months,
    nextDue: first,
  }));
  if (rows.length > 0) await prisma.maintenanceSchedule.createMany({ data: rows });
  revalidatePath("/maintenance/schedule");
  redirect("/maintenance/schedule");
}

export async function markScheduleDone(id: string) {
  const user = await requireRole("STAFF", "LANDLORD");
  const s = await prisma.maintenanceSchedule.findFirst({
    where: { id, property: ownerScopeFilter(user) },
  });
  if (!s) throw new Error("Not found.");
  const now = new Date();
  await prisma.maintenanceSchedule.update({
    where: { id },
    data: { lastDone: now, nextDue: addMonths(now, s.intervalMonths) },
  });
  revalidatePath("/maintenance/schedule");
}

export async function removeSchedule(id: string) {
  const user = await requireRole("STAFF", "LANDLORD");
  await prisma.maintenanceSchedule.deleteMany({ where: { id, property: ownerScopeFilter(user) } });
  revalidatePath("/maintenance/schedule");
}
