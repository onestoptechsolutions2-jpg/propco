import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

/**
 * Get the current session, or redirect to /login.
 * Call this at the top of any server component / server action that
 * requires a signed-in user.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

/**
 * Require one of the given roles, or redirect home with no access.
 * ADMIN always passes.
 */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (!roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

/**
 * Can the current user write to (create/edit) records belonging to
 * the given ownerId? True for ADMIN/STAFF always; for LANDLORD only
 * when it's their own ownerId; false for read-only OWNER.
 */
export function canManageOwnerRecords(
  user: { role: Role; ownerId: string | null },
  ownerId: string
) {
  if (user.role === "ADMIN" || user.role === "STAFF") return true;
  if (user.role === "LANDLORD" && user.ownerId === ownerId) return true;
  return false;
}

/**
 * Scope a Prisma `where` clause for properties/units/etc. to what this
 * user is allowed to see. STAFF/ADMIN see everything; OWNER and
 * LANDLORD only see their own portfolio.
 */
export function ownerScopeFilter(user: { role: Role; ownerId: string | null }) {
  if (user.role === "ADMIN" || user.role === "STAFF") return {};
  if (user.ownerId) return { ownerId: user.ownerId };
  return { ownerId: "__none__" }; // no owner linked -> sees nothing
}

export async function getOwnerForUser(userId: string) {
  return prisma.owner.findFirst({ where: { user: { id: userId } } });
}
