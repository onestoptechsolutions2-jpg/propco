"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { revalidatePath } from "next/cache";

/** Staff tapped "Send on WhatsApp" and the message was handed to their device. */
export async function markNotificationSent(id: string) {
  await requireRole("STAFF");
  await prisma.notification.updateMany({
    where: { id, status: "QUEUED", channel: "WHATSAPP" },
    data: { status: "SENT", sentAt: new Date(), error: null },
  });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
