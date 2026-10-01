"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { revalidatePath } from "next/cache";

export async function saveListing(unitId: string, formData: FormData) {
  const user = await requirePermission("listings.manage");
  const unit = await prisma.unit.findFirst({ where: { id: unitId, property: ownerScopeFilter(user) } });
  if (!unit) throw new Error("You don't have permission to edit this listing.");

  await prisma.unit.update({
    where: { id: unitId },
    data: {
      listed: formData.get("listed") === "on",
      listingText: String(formData.get("listingText") ?? "").trim().slice(0, 1500) || null,
      amenities: String(formData.get("amenities") ?? "").trim().slice(0, 300) || null,
      photoUrls:
        String(formData.get("photoUrls") ?? "")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^https:\/\//i.test(l))
          .slice(0, 8)
          .join("\n") || null,
    },
  });
  revalidatePath("/listings");
}

export async function saveContactPhone(formData: FormData) {
  const user = await requirePermission("team.manage");
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { contactPhone: String(formData.get("contactPhone") ?? "").trim().slice(0, 30) || null },
  });
  revalidatePath("/listings");
}
