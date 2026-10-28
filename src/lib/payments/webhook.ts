import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { loadOrgMerchant, loadPlatformMerchant } from "./config";
import type { MerchantConfig } from "./types";

/** Constant-time string comparison, so a secret can't be guessed by timing. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Resolved = { merchant: MerchantConfig; orgId: string | null }; // orgId null = PropCo's own account

/** Work out whose merchant account a webhook URL token belongs to. Null if it matches nobody. */
export async function resolveToken(token: string): Promise<Resolved | null> {
  const platform = loadPlatformMerchant();
  if (platform.callbackToken && safeEqual(token, platform.callbackToken)) return { merchant: platform, orgId: null };

  const row = await prisma.paymentSettings.findUnique({ where: { callbackToken: token } });
  if (!row) return null;
  const merchant = await loadOrgMerchant(prisma, row.orgId);
  return merchant ? { merchant, orgId: row.orgId } : null;
}

/** Read a JSON body of at most 64 KB, or null. */
export async function readJson(req: Request): Promise<unknown | null> {
  const text = await req.text();
  if (text.length > 65_536) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
