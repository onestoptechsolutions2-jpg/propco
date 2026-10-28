import { normalizePhone } from "../whatsapp";
import type { MpesaConfig, Outcome } from "./types";

/**
 * Safaricom Daraja: STK Push ("Lipa na M-Pesa Online").
 * The tenant gets a prompt on their phone and enters their PIN. Daraja then calls
 * our callback URL with the result; because that call is unsigned we never trust
 * it alone, we confirm with the STK Query API (see reconcile.ts).
 */
const BASE = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

// MPESA_BASE_URL exists so tests can point at a local mock gateway.
const base = (cfg: MpesaConfig) => process.env.MPESA_BASE_URL || BASE[cfg.env];
const withTimeout = () => ({ signal: AbortSignal.timeout(20_000) });

const timestamp = (d = new Date()) =>
  d.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHmmss
const password = (cfg: MpesaConfig, ts: string) =>
  Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64");

export async function getToken(cfg: MpesaConfig): Promise<string> {
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const res = await fetch(`${base(cfg)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    ...withTimeout(),
  });
  if (!res.ok) throw new Error(`M-Pesa sign-in failed (${res.status}). Check the consumer key and secret.`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("M-Pesa sign-in returned no token.");
  return json.access_token;
}

/** Ask the tenant's phone for payment. Returns Daraja's CheckoutRequestID. */
export async function stkPush(
  cfg: MpesaConfig,
  args: { amount: number; phone: string; reference: string; description: string; callbackUrl: string }
): Promise<{ checkoutRequestId: string; message: string }> {
  const phone = normalizePhone(args.phone);
  if (!phone) throw new Error("That phone number does not look right. Use a Kenyan number like 0712 345 678.");
  const token = await getToken(cfg);
  const ts = timestamp();
  const res = await fetch(`${base(cfg)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password(cfg, ts),
      Timestamp: ts,
      TransactionType: cfg.kind === "TILL" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
      Amount: Math.ceil(args.amount), // Daraja takes whole shillings
      PartyA: phone,
      PartyB: cfg.partyB,
      PhoneNumber: phone,
      CallBackURL: args.callbackUrl,
      AccountReference: args.reference.slice(0, 12),
      TransactionDesc: args.description.slice(0, 13),
    }),
    ...withTimeout(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    CheckoutRequestID?: string;
    ResponseCode?: string;
    CustomerMessage?: string;
    errorMessage?: string;
  };
  if (!res.ok || json.ResponseCode !== "0" || !json.CheckoutRequestID) {
    throw new Error(json.errorMessage || json.CustomerMessage || `M-Pesa refused the request (${res.status}).`);
  }
  return { checkoutRequestId: json.CheckoutRequestID, message: json.CustomerMessage ?? "Prompt sent." };
}

/** Ask Daraja what became of a push. Used to confirm callbacks and to catch lost ones. */
export async function stkQuery(cfg: MpesaConfig, checkoutRequestId: string): Promise<Outcome> {
  const token = await getToken(cfg);
  const ts = timestamp();
  const res = await fetch(`${base(cfg)}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password(cfg, ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
    ...withTimeout(),
  });
  const json = (await res.json().catch(() => ({}))) as { ResultCode?: string | number; ResultDesc?: string; errorCode?: string };
  // Daraja answers 500 "still being processed" while the customer has not acted yet.
  if (!res.ok || json.ResultCode === undefined) return { state: "PENDING" };
  if (String(json.ResultCode) === "0") {
    // The query confirms success but carries no receipt or amount; the callback does.
    return { state: "SUCCESS", receipt: "", paidAmount: 0 };
  }
  return { state: "FAILED", reason: json.ResultDesc || `M-Pesa result ${json.ResultCode}` };
}

export type ParsedCallback = {
  checkoutRequestId: string;
  success: boolean;
  reason: string;
  receipt: string;
  amount: number;
  phone: string;
};

/** Read Daraja's callback body. Returns null when it is not shaped like one. */
export function parseCallback(body: unknown): ParsedCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== "string") return null;
  const items = ((cb.CallbackMetadata as { Item?: { Name: string; Value?: string | number }[] } | undefined)?.Item ?? []);
  const get = (name: string) => items.find((i) => i.Name === name)?.Value;
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    success: Number(cb.ResultCode) === 0,
    reason: String(cb.ResultDesc ?? ""),
    receipt: String(get("MpesaReceiptNumber") ?? ""),
    amount: Number(get("Amount") ?? 0),
    phone: String(get("PhoneNumber") ?? ""),
  };
}
