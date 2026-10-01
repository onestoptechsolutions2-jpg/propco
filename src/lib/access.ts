import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ROLE_DEFAULTS, ROLE_LABEL } from "@/lib/permissions";

/** Everything the app needs to know about the signed-in user, read fresh from the database. */
const loadAccess = cache(async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      active: true,
      mustChangePassword: true,
      role: true,
      ownerId: true,
      orgId: true,
      orgRole: { select: { name: true, permissions: true } },
    },
  })
);

/**
 * Get the current user, or redirect to /login.
 * Role, company, permissions and suspension are read from the database on every
 * request (cached within one request), so changes by an admin apply immediately
 * even though sessions last 90 days.
 */
export async function requireUser(opts?: { allowPasswordChange?: boolean }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const db = await loadAccess(session.user.id);
  if (!db || !db.active) redirect("/login?error=Suspended");
  // Signed in (e.g. first Google login) but not yet attached to a company.
  if (!db.orgId) redirect("/onboarding");
  if (db.mustChangePassword && !opts?.allowPasswordChange) redirect("/account/password?required=1");

  const perms: string[] = db.orgRole ? db.orgRole.permissions : ROLE_DEFAULTS[db.role];
  return {
    ...session.user,
    role: db.role,
    ownerId: db.ownerId,
    orgId: db.orgId,
    perms,
    roleName: db.orgRole?.name ?? ROLE_LABEL[db.role],
    isCustomRole: !!db.orgRole,
    can: (permission: string) => perms.includes(permission),
  };
}

export type AccessUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * Require at least ONE of the given permissions, or redirect home with no access.
 * Pages and actions check permissions, never role names.
 */
export async function requirePermission(...permissions: string[]) {
  const user = await requireUser();
  if (!permissions.some((p) => user.perms.includes(p))) redirect("/dashboard?denied=1");
  return user;
}

/**
 * Require one of the given built-in roles (ADMIN always passes). Prefer
 * requirePermission; this remains for the few role-specific checks.
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
  user: { role: Role; ownerId: string | null; orgId: string },
  ownerId: string,
  recordOrgId: string
) {
  if (user.orgId !== recordOrgId) return false; // never cross company boundaries
  if (user.role === "ADMIN" || user.role === "STAFF") return true;
  if (user.role === "LANDLORD" && user.ownerId === ownerId) return true;
  return false;
}

/**
 * Scope a Prisma `where` clause for properties/units/etc. to what this
 * user is allowed to see. STAFF/ADMIN see everything; OWNER and
 * LANDLORD only see their own portfolio.
 */
export function ownerScopeFilter(user: { role: Role; ownerId: string | null; orgId: string }) {
  if (user.role === "ADMIN" || user.role === "STAFF") return { orgId: user.orgId };
  if (user.ownerId) return { orgId: user.orgId, ownerId: user.ownerId };
  return { orgId: user.orgId, ownerId: "__none__" }; // no owner linked -> sees nothing
}

export async function getOwnerForUser(userId: string) {
  return prisma.owner.findFirst({ where: { user: { id: userId } } });
}
