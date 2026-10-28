import type { FlutterwaveConfig, Outcome } from "./types";

/**
 * Flutterwave Standard: we create a hosted checkout link, the customer pays by
 * card, bank transfer or mobile money on Flutterwave's page, and Flutterwave
 * calls our webhook. The webhook proves nothing by itself: we check the
 * verif-hash header and then ask Flutterwave to verify the transaction.
 * Paystack or Pesapal can be added the same way (see docs/payments.md).
 */
const base = () => process.env.FLUTTERWAVE_BASE_URL || "https://api.flutterwave.com";
const signal = () => AbortSignal.timeout(20_000);

export async function createCheckout(
  cfg: FlutterwaveConfig,
  args: { txRef: string; amount: number; currency: string; redirectUrl: string; email: string; phone?: string; name: string; title: string }
): Promise<string> {
  const res = await fetch(`${base()}/v3/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: args.txRef,
      amount: args.amount,
      currency: args.currency,
      redirect_url: args.redirectUrl,
      customer: { email: args.email, phonenumber: args.phone, name: args.name },
      customizations: { title: args.title },
    }),
    signal: signal(),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: { link?: string } };
  if (!res.ok || json.status !== "success" || !json.data?.link) {
    throw new Error(json.message || `Flutterwave refused the request (${res.status}).`);
  }
  return json.data.link;
}

/** Ask Flutterwave for the real state of a payment, by our reference. */
export async function verifyByReference(cfg: FlutterwaveConfig, txRef: string): Promise<Outcome & { currency?: string }> {
  const res = await fetch(`${base()}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
    headers: { Authorization: `Bearer ${cfg.secretKey}` },
    signal: signal(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: { status?: string; amount?: number; currency?: string; flw_ref?: string; processor_response?: string };
  };
  if (!res.ok || json.status !== "success" || !json.data) return { state: "PENDING" };
  const d = json.data;
  if (d.status === "successful") {
    return { state: "SUCCESS", receipt: d.flw_ref ?? "", paidAmount: Number(d.amount ?? 0), currency: d.currency };
  }
  if (d.status === "failed" || d.status === "cancelled") {
    return { state: "FAILED", reason: d.processor_response || `Payment ${d.status}` };
  }
  return { state: "PENDING" };
}

/** Cheap authenticated call used by Settings, "Test keys": true when Flutterwave accepts the secret key. */
export async function checkKey(cfg: FlutterwaveConfig): Promise<boolean> {
  const res = await fetch(`${base()}/v3/banks/KE`, { headers: { Authorization: `Bearer ${cfg.secretKey}` }, signal: signal() });
  return res.ok;
}
