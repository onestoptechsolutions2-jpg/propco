import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "./crypto";
import type { MerchantConfig, MpesaConfig, FlutterwaveConfig } from "./types";

/** The public address of this deployment, used to build webhook URLs. */
export function appBaseUrl(hostHeader?: string | null, protoHeader?: string | null) {
  const fixed = process.env.APP_URL || process.env.AUTH_URL;
  if (fixed) return fixed.replace(/\/+$/, "");
  if (hostHeader) return `${protoHeader ?? "https"}://${hostHeader}`;
  return "http://localhost:3000";
}

export const newToken = () => randomBytes(24).toString("hex");

function mpesaFrom(row: {
  mpesaEnabled: boolean;
  mpesaEnv: string;
  mpesaKind: string;
  mpesaShortcode: string | null;
  mpesaPartyB: string | null;
  mpesaConsumerKeyEnc: string | null;
  mpesaConsumerSecretEnc: string | null;
  mpesaPasskeyEnc: string | null;
}): MpesaConfig | null {
  if (!row.mpesaEnabled || !row.mpesaShortcode) return null;
  const consumerKey = decrypt(row.mpesaConsumerKeyEnc);
  const consumerSecret = decrypt(row.mpesaConsumerSecretEnc);
  const passkey = decrypt(row.mpesaPasskeyEnc);
  if (!consumerKey || !consumerSecret || !passkey) return null;
  return {
    env: row.mpesaEnv === "production" ? "production" : "sandbox",
    kind: row.mpesaKind === "TILL" ? "TILL" : "PAYBILL",
    shortcode: row.mpesaShortcode,
    partyB: row.mpesaPartyB || row.mpesaShortcode,
    consumerKey,
    consumerSecret,
    passkey,
  };
}

/** A company's own provider settings (for rent). Null when it has not set any up. */
export async function loadOrgMerchant(db: PrismaClient, orgId: string): Promise<MerchantConfig | null> {
  const row = await db.paymentSettings.findUnique({ where: { orgId } });
  if (!row) return null;
  const secret = decrypt(row.flutterwaveSecretKeyEnc);
  const hash = decrypt(row.flutterwaveHashEnc);
  const flutterwave: FlutterwaveConfig | null =
    row.flutterwaveEnabled && secret && hash ? { secretKey: secret, webhookHash: hash } : null;
  return { callbackToken: row.callbackToken, mpesa: mpesaFrom(row), flutterwave };
}

/** PropCo's own account, from environment variables (for plan payments). */
export function loadPlatformMerchant(): MerchantConfig {
  const e = process.env;
  const mpesa: MpesaConfig | null =
    e.PLATFORM_MPESA_CONSUMER_KEY && e.PLATFORM_MPESA_CONSUMER_SECRET && e.PLATFORM_MPESA_PASSKEY && e.PLATFORM_MPESA_SHORTCODE
      ? {
          env: e.PLATFORM_MPESA_ENV === "production" ? "production" : "sandbox",
          kind: e.PLATFORM_MPESA_KIND === "TILL" ? "TILL" : "PAYBILL",
          shortcode: e.PLATFORM_MPESA_SHORTCODE,
          partyB: e.PLATFORM_MPESA_PARTY_B || e.PLATFORM_MPESA_SHORTCODE,
          consumerKey: e.PLATFORM_MPESA_CONSUMER_KEY,
          consumerSecret: e.PLATFORM_MPESA_CONSUMER_SECRET,
          passkey: e.PLATFORM_MPESA_PASSKEY,
        }
      : null;
  const flutterwave: FlutterwaveConfig | null =
    e.PLATFORM_FLW_SECRET_KEY && e.PLATFORM_FLW_WEBHOOK_HASH
      ? { secretKey: e.PLATFORM_FLW_SECRET_KEY, webhookHash: e.PLATFORM_FLW_WEBHOOK_HASH }
      : null;
  return { callbackToken: e.PLATFORM_CALLBACK_TOKEN ?? "", mpesa, flutterwave };
}

/** The merchant account that an intent's money goes to. */
export async function merchantForIntent(db: PrismaClient, intent: { purpose: string; orgId: string }) {
  return intent.purpose === "SUBSCRIPTION" ? loadPlatformMerchant() : loadOrgMerchant(db, intent.orgId);
}

/** Save settings from the form. A blank secret keeps the stored one. */
export async function saveOrgSettings(
  db: PrismaClient,
  orgId: string,
  input: {
    mpesaEnabled: boolean;
    mpesaEnv: string;
    mpesaKind: string;
    mpesaShortcode: string;
    mpesaPartyB: string;
    mpesaConsumerKey: string;
    mpesaConsumerSecret: string;
    mpesaPasskey: string;
    flutterwaveEnabled: boolean;
    flutterwaveSecretKey: string;
    flutterwaveHash: string;
  }
) {
  const keep = (v: string) => (v.trim() ? encrypt(v.trim()) : undefined);
  const data = {
    mpesaEnabled: input.mpesaEnabled,
    mpesaEnv: input.mpesaEnv === "production" ? "production" : "sandbox",
    mpesaKind: input.mpesaKind === "TILL" ? "TILL" : "PAYBILL",
    mpesaShortcode: input.mpesaShortcode.trim() || null,
    mpesaPartyB: input.mpesaPartyB.trim() || null,
    mpesaConsumerKeyEnc: keep(input.mpesaConsumerKey),
    mpesaConsumerSecretEnc: keep(input.mpesaConsumerSecret),
    mpesaPasskeyEnc: keep(input.mpesaPasskey),
    flutterwaveEnabled: input.flutterwaveEnabled,
    flutterwaveSecretKeyEnc: keep(input.flutterwaveSecretKey),
    flutterwaveHashEnc: keep(input.flutterwaveHash),
  };
  await db.paymentSettings.upsert({
    where: { orgId },
    create: { orgId, callbackToken: newToken(), ...data },
    update: data,
  });
}
