import { prisma } from "@/lib/prisma";

/**
 * Record who did what. Never throws: an audit write must not break the action
 * it describes.
 */
export async function audit(
  actor: { id?: string; name?: string | null; email?: string | null; orgId: string },
  action: string,
  detail?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        actorName: actor.name ?? actor.email ?? "System",
        action,
        detail: detail?.slice(0, 400),
      },
    });
  } catch (e) {
    console.error("[audit] write failed:", e);
  }
}
