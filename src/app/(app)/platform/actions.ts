"use server";

import { revalidatePath } from "next/cache";
import type { Plan } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/platform";
import * as ops from "@/lib/platform-ops";

/** Every action re-checks that the caller is PropCo staff; hiding a button is not security. */
const done = (orgId: string) => revalidatePath(`/platform/${orgId}`);

export async function activatePlan(orgId: string, formData: FormData) {
  const me = await requirePlatformAdmin();
  await ops.activatePlan(me.email!, orgId, String(formData.get("plan")) as Plan, Number(formData.get("months")));
  done(orgId);
}

export async function extendTrial(orgId: string) {
  const me = await requirePlatformAdmin();
  await ops.extendTrial(me.email!, orgId);
  done(orgId);
}

export async function suspendOrg(orgId: string, formData: FormData) {
  const me = await requirePlatformAdmin();
  await ops.suspendOrg(me.email!, me.orgId, orgId, String(formData.get("reason") ?? ""));
  done(orgId);
}

export async function unsuspendOrg(orgId: string) {
  const me = await requirePlatformAdmin();
  await ops.unsuspendOrg(me.email!, orgId);
  done(orgId);
}

export async function addNote(orgId: string, formData: FormData) {
  const me = await requirePlatformAdmin();
  await ops.addNote(me.email!, orgId, String(formData.get("body") ?? ""));
  done(orgId);
}

export async function unlockUser(orgId: string, userId: string) {
  const me = await requirePlatformAdmin();
  await ops.unlockUser(me.email!, orgId, userId);
  done(orgId);
}

export async function forcePasswordChange(orgId: string, userId: string) {
  const me = await requirePlatformAdmin();
  await ops.forcePasswordChange(me.email!, orgId, userId);
  done(orgId);
}

export async function setUserActive(orgId: string, userId: string, active: boolean) {
  const me = await requirePlatformAdmin();
  await ops.setUserActive(me.email!, orgId, userId, active);
  done(orgId);
}

export type TempPasswordState = { email?: string | null; temp?: string; error?: string } | null;

/** Returns the temporary password to the page once, in memory only: it is never put in a URL or stored. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState always passes the previous state first
export async function issueTempPassword(orgId: string, userId: string, _prev: TempPasswordState): Promise<TempPasswordState> {
  const me = await requirePlatformAdmin();
  try {
    const r = await ops.issueTempPassword(me.email!, orgId, userId);
    done(orgId);
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reset the password." };
  }
}
