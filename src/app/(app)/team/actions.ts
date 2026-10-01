"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePermission, type AccessUser } from "@/lib/access";
import { audit } from "@/lib/audit";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const go = (path: string, key: "error" | "ok", message: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);

/** Role choices are "ADMIN", "STAFF" or "custom:<id>". */
async function resolveRoleChoice(user: AccessUser, choice: string, back: string) {
  if (choice === "ADMIN") {
    if (user.role !== "ADMIN") go(back, "error", "Only an admin can make someone an admin.");
    return { role: "ADMIN" as const, orgRoleId: null };
  }
  if (choice === "STAFF") return { role: "STAFF" as const, orgRoleId: null };
  if (choice.startsWith("custom:")) {
    const role = await prisma.orgRole.findFirst({ where: { id: choice.slice(7), orgId: user.orgId } });
    if (!role) go(back, "error", "That role no longer exists.");
    // No privilege escalation: you can only hand out permissions you hold yourself.
    if (user.role !== "ADMIN" && role!.permissions.some((p) => !user.can(p))) {
      go(back, "error", "You can't give someone a role with permissions you don't have.");
    }
    return { role: "STAFF" as const, orgRoleId: role!.id };
  }
  return go(back, "error", "Choose a role.");
}

/** At least one active admin must always remain. */
async function assertNotLastAdmin(orgId: string, targetId: string) {
  const others = await prisma.user.count({ where: { orgId, role: "ADMIN", active: true, id: { not: targetId } } });
  if (others === 0) throw new Error("There must always be at least one active admin.");
}

const memberSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.string().min(1),
});

export async function addMember(formData: FormData) {
  const user = await requirePermission("team.manage");
  const parsed = memberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) go("/team", "error", parsed.error.issues[0].message);
  const d = parsed.data!;
  if (await prisma.user.findUnique({ where: { email: d.email } })) go("/team", "error", "That email already has an account.");

  const assign = await resolveRoleChoice(user, d.role, "/team");
  await prisma.user.create({
    data: {
      name: d.name,
      email: d.email,
      orgId: user.orgId,
      passwordHash: await bcrypt.hash(d.password, 10),
      mustChangePassword: true, // they choose their own password at first sign-in
      ...assign,
    },
  });
  await audit(user, "user.created", `${d.email} as ${d.role}`);
  revalidatePath("/team");
  go("/team", "ok", "Team member added. They will be asked to choose a new password when they first sign in.");
}

export async function updateMember(id: string, formData: FormData) {
  const user = await requirePermission("team.manage");
  const back = `/team/${id}`;
  if (id === user.id) go(back, "error", "You can't change your own role. Ask another admin.");

  const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } } });
  if (!target) go("/team", "error", "Member not found.");
  // A non-admin can't modify an admin.
  if (target!.role === "ADMIN" && user.role !== "ADMIN") go(back, "error", "Only an admin can change another admin.");

  const assign = await resolveRoleChoice(user, String(formData.get("role") ?? ""), back);
  if (target!.role === "ADMIN" && assign.role !== "ADMIN") await assertNotLastAdmin(user.orgId, id);

  await prisma.user.update({ where: { id }, data: assign });
  await audit(user, "user.role_changed", `${target!.email}: ${String(formData.get("role"))}`);
  revalidatePath("/team");
  go(back, "ok", "Role updated.");
}

export async function setMemberActive(id: string, active: boolean) {
  const user = await requirePermission("team.manage");
  if (id === user.id) throw new Error("You can't suspend yourself.");
  const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } } });
  if (!target) throw new Error("Member not found.");
  if (target.role === "ADMIN" && user.role !== "ADMIN") throw new Error("Only an admin can change another admin.");
  if (!active && target.role === "ADMIN") await assertNotLastAdmin(user.orgId, id);

  await prisma.user.update({ where: { id }, data: { active, failedLogins: 0, lockedUntil: null } });
  await audit(user, active ? "user.reactivated" : "user.suspended", target.email ?? target.id);
  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
}

export async function resetMemberPassword(id: string, formData: FormData) {
  const user = await requirePermission("team.manage");
  const back = `/team/${id}`;
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) go(back, "error", "Password must be at least 8 characters.");
  const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } } });
  if (!target) go("/team", "error", "Member not found.");
  if (target!.role === "ADMIN" && user.role !== "ADMIN" && id !== user.id) go(back, "error", "Only an admin can reset another admin's password.");

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
  });
  await audit(user, "user.password_reset", target!.email ?? target!.id);
  go(back, "ok", "Temporary password set. They must choose a new one when they sign in.");
}

export async function removeMember(id: string) {
  const user = await requirePermission("team.manage");
  if (id === user.id) throw new Error("You can't remove yourself.");
  const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } } });
  if (!target) return;
  if (target.role === "ADMIN" && user.role !== "ADMIN") throw new Error("Only an admin can remove another admin.");
  if (target.role === "ADMIN") await assertNotLastAdmin(user.orgId, id);
  await prisma.user.delete({ where: { id } });
  await audit(user, "user.removed", target.email ?? target.id);
  revalidatePath("/team");
  redirect("/team");
}

// ---------- Custom roles ----------

const roleSchema = z.object({
  name: z.string().trim().min(2, "Give the role a name").max(40),
  description: z.string().trim().max(200).optional(),
});

function pickPermissions(user: AccessUser, formData: FormData, back: string) {
  const chosen = ALL_PERMISSIONS.filter((p) => formData.get(`perm_${p}`) === "on");
  if (chosen.length === 0) go(back, "error", "Tick at least one permission.");
  if (user.role !== "ADMIN") {
    const over = chosen.filter((p) => !user.can(p));
    if (over.length > 0) go(back, "error", "You can only give permissions you have yourself.");
  }
  return chosen;
}

export async function createRole(formData: FormData) {
  const user = await requirePermission("team.manage");
  const parsed = roleSchema.safeParse({ name: formData.get("name"), description: formData.get("description") || undefined });
  if (!parsed.success) go("/team/roles", "error", parsed.error.issues[0].message);
  const permissions = pickPermissions(user, formData, "/team/roles");
  if (await prisma.orgRole.findUnique({ where: { orgId_name: { orgId: user.orgId, name: parsed.data!.name } } })) {
    go("/team/roles", "error", "You already have a role with that name.");
  }
  const role = await prisma.orgRole.create({
    data: { orgId: user.orgId, name: parsed.data!.name, description: parsed.data!.description, permissions },
  });
  await audit(user, "role.created", `${role.name}: ${permissions.length} permissions`);
  revalidatePath("/team/roles");
  go("/team/roles", "ok", `Role "${role.name}" created.`);
}

export async function updateRole(id: string, formData: FormData) {
  const user = await requirePermission("team.manage");
  const back = `/team/roles/${id}`;
  const role = await prisma.orgRole.findFirst({ where: { id, orgId: user.orgId } });
  if (!role) go("/team/roles", "error", "Role not found.");
  const parsed = roleSchema.safeParse({ name: formData.get("name"), description: formData.get("description") || undefined });
  if (!parsed.success) go(back, "error", parsed.error.issues[0].message);
  // Editing a role changes access for everyone who has it, so the same escalation rule applies to its current permissions.
  if (user.role !== "ADMIN" && role!.permissions.some((p) => !user.can(p))) {
    go(back, "error", "This role has permissions you don't have, so only an admin can edit it.");
  }
  const permissions = pickPermissions(user, formData, back);
  const clash = await prisma.orgRole.findFirst({ where: { orgId: user.orgId, name: parsed.data!.name, id: { not: id } } });
  if (clash) go(back, "error", "You already have a role with that name.");

  await prisma.orgRole.update({ where: { id }, data: { name: parsed.data!.name, description: parsed.data!.description ?? null, permissions } });
  await audit(user, "role.updated", `${parsed.data!.name}: ${permissions.length} permissions`);
  revalidatePath("/team/roles");
  go(back, "ok", "Role saved. It applies to everyone with this role straight away.");
}

export async function deleteRole(id: string) {
  const user = await requirePermission("team.manage");
  const role = await prisma.orgRole.findFirst({ where: { id, orgId: user.orgId }, include: { _count: { select: { users: true } } } });
  if (!role) return;
  if (role._count.users > 0) go(`/team/roles/${id}`, "error", "Move the people with this role to another role first.");
  await prisma.orgRole.delete({ where: { id } });
  await audit(user, "role.deleted", role.name);
  revalidatePath("/team/roles");
  redirect("/team/roles");
}
