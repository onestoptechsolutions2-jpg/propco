export type MpesaConfig = {
  env: "sandbox" | "production";
  kind: "PAYBILL" | "TILL";
  shortcode: string;
  partyB: string;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
};

export type FlutterwaveConfig = {
  secretKey: string;
  /** The "secret hash" set on the Flutterwave webhook; sent back in the verif-hash header. */
  webhookHash: string;
};

/** Which merchant account receives the money: a company's own, or PropCo's (for plan payments). */
export type MerchantConfig = {
  callbackToken: string;
  mpesa: MpesaConfig | null;
  flutterwave: FlutterwaveConfig | null;
};

/** What a provider says happened to a payment. */
export type Outcome =
  | { state: "SUCCESS"; receipt: string; paidAmount: number; phone?: string }
  | { state: "FAILED"; reason: string }
  | { state: "PENDING" };
