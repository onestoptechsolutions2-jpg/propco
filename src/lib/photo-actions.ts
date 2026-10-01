"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { revalidatePath } from "next/cache";

const MAX_BYTES = 900_000; // the browser shrinks photos to ~200-400 KB first
const MAX_PER_TARGET = 8;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** Attach a photo to a repair request ("request") or a unit's vacancy page ("unit"). */
export async function uploadPhoto(kind: "request" | "unit", targetId: string, formData: FormData) {
  const user = await requirePermission("maintenance.manage", "listings.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a photo first.");
  if (!ALLOWED.includes(file.type)) throw new Error("Photos must be JPEG, PNG or WebP.");
  if (file.size > MAX_BYTES) throw new Error("That photo is too large. Try a smaller one.");

  let where: { requestId: string } | { unitId: string };
  if (kind === "request") {
    const r = await prisma.maintenanceRequest.findFirst({
      where: { id: targetId, unit: { property: ownerScopeFilter(user) } },
    });
    if (!r) throw new Error("You don't have permission to add photos here.");
    where = { requestId: targetId };
  } else {
    const u = await prisma.unit.findFirst({ where: { id: targetId, property: ownerScopeFilter(user) } });
    if (!u) throw new Error("You don't have permission to add photos here.");
    where = { unitId: targetId };
  }

  if ((await prisma.photo.count({ where })) >= MAX_PER_TARGET) {
    throw new Error(`You can add up to ${MAX_PER_TARGET} photos.`);
  }

  await prisma.photo.create({
    data: {
      ...where,
      orgId: user.orgId,
      mime: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
      caption: String(formData.get("caption") ?? "").trim().slice(0, 120) || null,
    },
  });

  revalidatePath(kind === "request" ? `/maintenance/${targetId}` : "/listings");
}

export async function deletePhoto(id: string) {
  const user = await requirePermission("maintenance.manage", "listings.manage");
  const photo = await prisma.photo.findFirst({ where: { id, orgId: user.orgId } });
  if (!photo) return;
  await prisma.photo.delete({ where: { id } });
  revalidatePath("/listings");
  if (photo.requestId) revalidatePath(`/maintenance/${photo.requestId}`);
}
