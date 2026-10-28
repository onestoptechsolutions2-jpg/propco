import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { PLANS } from "@/lib/plan-catalog";

/**
 * What PropCo support can do to a customer. Every operation:
 *  - is written to the customer's own activity log as "Support: <email>", so their admins can
 *    see exactly what was done to their account and by whom;
 *  - touches one company or one of its users, never reads tenant or financial records.
 * The callers (server actions) have already checked that the actor is a platform admin.
 */
const as = (email: string, orgId: string) => ({ orgId, name: `Support: ${email}`, email });

async function userInOrg(orgId: string, userId: string) {
  const u = await prisma.user.findFirst({ where: { id: userId, orgId } });
  if (!u) throw new Error("That person is not in this company.");
  return u;
}

export async function activatePlan(actor: string, orgId: string, plan: Plan, months: number) {
  if (!(plan in PLANS)) throw new Error("Unknown plan.");
  const m = Math.min(24, Math.max(1, Math.floor(months) || 1));
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const base = org.paidUntil && org.paidUntil > new Date() ? org.paidUntil : new Date();
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan,
      paidUntil: plan === "FREE" ? null : new Date(base.getTime() + m * 30 * 86_400_000),
      billingNote: `${PLANS[plan].label} activated for ${m} month(s) on ${new Date().toISOString().slice(0, 10)}`,
    },
  });
  await audit(as(actor, orgId), "support.plan", `${PLANS[plan].label} for ${m} month(s)`);
}

export async function extendTrial(actor: string, orgId: string, days = 14) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const base = org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
  await prisma.organization.update({ where: { id: orgId }, data: { trialEndsAt: new Date(base.getTime() + days * 86_400_000) } });
  await audit(as(actor, orgId), "support.trial", `Trial extended by ${days} days`);
}

export async function suspendOrg(actor: string, actorOrgId: string | null, orgId: string, reason: string) {
  if (orgId === actorOrgId) throw new Error("You can't suspend your own company.");
  await prisma.organization.update({ where: { id: orgId }, data: { suspendedAt: new Date(), suspendedReason: reason.slice(0, 300) || "No reason given" } });
  await audit(as(actor, orgId), "support.suspend", reason.slice(0, 200));
}

export async function unsuspendOrg(actor: string, orgId: string) {
  await prisma.organization.update({ where: { id: orgId }, data: { suspendedAt: null, suspendedReason: null } });
  await audit(as(actor, orgId), "support.unsuspend", "Company reactivated");
}

export async function addNote(actor: string, orgId: string, body: string) {
  const text = body.trim();
  if (text.length < 2) throw new Error("Write something first.");
  await prisma.supportNote.create({ data: { orgId, authorEmail: actor, body: text.slice(0, 2000) } });
}

export async function unlockUser(actor: string, orgId: string, userId: string) {
  const u = await userInOrg(orgId, userId);
  await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit(as(actor, orgId), "support.unlock", `Unlocked ${u.email}`);
}

export async function forcePasswordChange(actor: string, orgId: string, userId: string) {
  const u = await userInOrg(orgId, userId);
  await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: true } });
  await audit(as(actor, orgId), "support.force-password", `${u.email} must choose a new password at next sign-in`);
}

export async function setUserActive(actor: string, orgId: string, userId: string, active: boolean) {
  const u = await userInOrg(orgId, userId);
  await prisma.user.update({ where: { id: u.id }, data: { active } });
  await audit(as(actor, orgId), active ? "support.user-on" : "support.user-off", `${active ? "Reactivated" : "Suspended"} ${u.email}`);
}

// No look-alike characters (0/O, 1/l/I) so it can be read out over the phone.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Sets a random temporary password and returns it once. The person must replace it at next sign-in. */
export async function issueTempPassword(actor: string, orgId: string, userId: string) {
  const u = await userInOrg(orgId, userId);
  const temp = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await bcrypt.hash(temp, 10), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
  });
  await audit(as(actor, orgId), "support.temp-password", `Temporary password issued to ${u.email}`);
  return { email: u.email, temp };
}
