/**
 * End-to-end test of online payments against a running app and the mock gateway.
 * Use scripts/payments-test/run.sh, which starts everything with the right environment.
 * Creates its own company and removes it again at the end.
 */
import { PrismaClient } from "@prisma/client";
import { saveOrgSettings } from "../../src/lib/payments/config";
import { decrypt } from "../../src/lib/payments/crypto";
import { stkPush } from "../../src/lib/payments/mpesa";
import { createCheckout } from "../../src/lib/payments/flutterwave";
import { reconcilePending } from "../../src/lib/payments/reconcile";

const APP = process.env.APP_URL_TEST || "http://localhost:3058";
const MOCK = process.env.MOCK_URL || "http://localhost:4010";
const db = new PrismaClient();

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : `  (${extra})`}`);
  if (!ok) failures++;
};
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(APP + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const setMock = (kind: "mpesa" | "flw", ref: string, result: string, extra: object = {}) =>
  fetch(MOCK + "/__set", { method: "POST", body: JSON.stringify({ kind, ref, result, ...extra }) });
const callback = (id: string, success: boolean, amount: number, receipt: string) => ({
  Body: {
    stkCallback: {
      MerchantRequestID: "m",
      CheckoutRequestID: id,
      ResultCode: success ? 0 : 1032,
      ResultDesc: success ? "The service request is processed successfully." : "Request cancelled by user",
      ...(success
        ? { CallbackMetadata: { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: receipt }, { Name: "PhoneNumber", Value: 254712345678 }] } }
        : {}),
    },
  },
});

async function makeCompany(label: string) {
  const org = await db.organization.create({ data: { name: `PayTest ${label}`, trialEndsAt: new Date(Date.now() + 864e5) } });
  const owner = await db.owner.create({ data: { name: "O", orgId: org.id } });
  const property = await db.property.create({ data: { name: "P", addressLine1: "x", orgId: org.id, ownerId: owner.id } });
  const unit = await db.unit.create({ data: { label: "U1", rentAmount: 10000, propertyId: property.id, status: "OCCUPIED" } });
  const tenant = await db.tenant.create({ data: { name: "Test Tenant", phone: "0712345678", orgId: org.id } });
  const lease = await db.lease.create({ data: { startDate: new Date(), rentAmount: 10000, unitId: unit.id, tenantId: tenant.id } });
  await saveOrgSettings(db, org.id, {
    mpesaEnabled: true, mpesaEnv: "sandbox", mpesaKind: "PAYBILL", mpesaShortcode: "174379", mpesaPartyB: "",
    mpesaConsumerKey: "ck", mpesaConsumerSecret: "cs", mpesaPasskey: "pk",
    flutterwaveEnabled: true, flutterwaveSecretKey: "FLWSECK_TEST", flutterwaveHash: "my-hash",
  });
  const settings = await db.paymentSettings.findUniqueOrThrow({ where: { orgId: org.id } });
  return { org, lease, token: settings.callbackToken, settings };
}

/** Same steps as startPayment(), without needing a Next request. */
async function newMpesaIntent(c: Awaited<ReturnType<typeof makeCompany>>, amount = 10000) {
  const open = await db.payment.create({ data: { leaseId: c.lease.id, amount, dueDate: new Date(), status: "PENDING" } });
  const intent = await db.paymentIntent.create({ data: { orgId: c.org.id, purpose: "RENT", provider: "MPESA", amount, leaseId: c.lease.id, paymentId: open.id, phone: "0712345678" } });
  const sent = await stkPush(
    { env: "sandbox", kind: "PAYBILL", shortcode: "174379", partyB: "174379", consumerKey: "ck", consumerSecret: "cs", passkey: "pk" },
    { amount, phone: "0712345678", reference: "U1", description: "Rent", callbackUrl: `${APP}/api/payments/mpesa/${c.token}` }
  );
  const updated = await db.paymentIntent.update({ where: { id: intent.id }, data: { providerRef: sent.checkoutRequestId } });
  return { intent: updated, payment: open };
}

async function newFlwIntent(c: Awaited<ReturnType<typeof makeCompany>>, purpose: "RENT" | "SUBSCRIPTION" = "RENT", amount = 10000, extra: object = {}) {
  const intent = await db.paymentIntent.create({ data: { orgId: c.org.id, purpose, provider: "FLUTTERWAVE", amount, leaseId: purpose === "RENT" ? c.lease.id : null, ...extra } });
  const ref = `pi_${intent.id}`;
  const link = await createCheckout({ secretKey: "FLWSECK_TEST", webhookHash: "my-hash" }, { txRef: ref, amount, currency: "KES", redirectUrl: `${APP}/pay/done`, email: "t@x.y", name: "T", title: "Rent" });
  return db.paymentIntent.update({ where: { id: intent.id }, data: { providerRef: ref, checkoutUrl: link } });
}

async function main() {
  const A = await makeCompany("A");
  const B = await makeCompany("B");
  const created = [A.org.id, B.org.id];
  try {
    // --- secrets are encrypted at rest
    check("secrets stored encrypted", !!A.settings.mpesaPasskeyEnc && !A.settings.mpesaPasskeyEnc.includes("pk") && decrypt(A.settings.mpesaPasskeyEnc) === "pk");

    // --- M-Pesa happy path
    const m1 = await newMpesaIntent(A);
    check("STK push recorded a CheckoutRequestID", !!m1.intent.providerRef);
    await setMock("mpesa", m1.intent.providerRef!, "0");
    const r1 = await post(`/api/payments/mpesa/${A.token}`, callback(m1.intent.providerRef!, true, 10000, "SGH7K2ABCD"));
    check("callback accepted (200)", r1.status === 200);
    const p1 = await db.payment.findUniqueOrThrow({ where: { id: m1.payment.id } });
    const i1 = await db.paymentIntent.findUniqueOrThrow({ where: { id: m1.intent.id } });
    check("rent marked PAID with receipt", p1.status === "PAID" && p1.reference === "SGH7K2ABCD" && p1.method === "MPESA", `${p1.status} ${p1.reference}`);
    check("intent SUCCESS with amount", i1.status === "SUCCESS" && Number(i1.paidAmount) === 10000);
    check("audit row written", (await db.auditLog.count({ where: { orgId: A.org.id, action: "payment.online" } })) === 1);

    // --- replay is harmless
    await post(`/api/payments/mpesa/${A.token}`, callback(m1.intent.providerRef!, true, 10000, "SGH7K2ABCD"));
    check("replayed callback does not pay twice", (await db.payment.count({ where: { leaseId: A.lease.id, status: "PAID" } })) === 1);

    // --- forged / wrong callbacks
    const m2 = await newMpesaIntent(A);
    await post(`/api/payments/mpesa/not-a-real-token`, callback(m2.intent.providerRef!, true, 10000, "FAKE000001"));
    check("unknown token is ignored", (await db.paymentIntent.findUniqueOrThrow({ where: { id: m2.intent.id } })).status === "PENDING");
    await post(`/api/payments/mpesa/${B.token}`, callback(m2.intent.providerRef!, true, 10000, "FAKE000002"));
    check("another company's token cannot complete it", (await db.paymentIntent.findUniqueOrThrow({ where: { id: m2.intent.id } })).status === "PENDING");
    await post(`/api/payments/mpesa/${A.token}`, callback(m2.intent.providerRef!, true, 10000, "FAKE000003")); // mock still says pending
    check("callback alone is not trusted (query says pending)", (await db.paymentIntent.findUniqueOrThrow({ where: { id: m2.intent.id } })).status === "PENDING");
    await setMock("mpesa", m2.intent.providerRef!, "1032");
    await post(`/api/payments/mpesa/${A.token}`, callback(m2.intent.providerRef!, true, 10000, "FAKE000004"));
    const i2 = await db.paymentIntent.findUniqueOrThrow({ where: { id: m2.intent.id } });
    check("forged success is rejected when Daraja says cancelled", i2.status === "FAILED" && (await db.payment.findUniqueOrThrow({ where: { id: m2.payment.id } })).status === "PENDING", i2.status);
    check("garbage body is ignored (200)", (await post(`/api/payments/mpesa/${A.token}`, { hello: "world" })).status === 200);

    // --- concurrency: five identical callbacks at once
    const m3 = await newMpesaIntent(A);
    await setMock("mpesa", m3.intent.providerRef!, "0");
    await Promise.all(Array.from({ length: 5 }, () => post(`/api/payments/mpesa/${A.token}`, callback(m3.intent.providerRef!, true, 10000, "CONC000001"))));
    check("5 simultaneous callbacks pay exactly once", (await db.payment.count({ where: { leaseId: A.lease.id, reference: "CONC000001" } })) === 1);

    // --- lost callback recovered by the worker job
    const m4 = await newMpesaIntent(A);
    await setMock("mpesa", m4.intent.providerRef!, "0");
    await db.paymentIntent.update({ where: { id: m4.intent.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    const done = await reconcilePending(db);
    check("worker reconcile completes a lost callback", done.some((d) => d.intentId === m4.intent.id) && (await db.payment.findUniqueOrThrow({ where: { id: m4.payment.id } })).status === "PAID");
    const m5 = await newMpesaIntent(A);
    await db.paymentIntent.update({ where: { id: m5.intent.id }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
    await reconcilePending(db);
    check("worker gives up on an expired prompt", (await db.paymentIntent.findUniqueOrThrow({ where: { id: m5.intent.id } })).status === "FAILED");

    // --- Flutterwave
    const f1 = await newFlwIntent(A);
    check("checkout link created", !!f1.checkoutUrl?.startsWith("https://checkout.flutterwave.test/"));
    const hook = (i: { providerRef: string | null }) => ({ event: "charge.completed", data: { tx_ref: i.providerRef, status: "successful" } });
    await setMock("flw", f1.providerRef!, "successful", { amount: 10000, currency: "KES" });
    check("webhook without hash is refused (401)", (await post(`/api/payments/flutterwave/${A.token}`, hook(f1))).status === 401);
    check("webhook with wrong hash is refused (401)", (await post(`/api/payments/flutterwave/${A.token}`, hook(f1), { "verif-hash": "nope" })).status === 401);
    check("refused webhooks leave the payment pending", (await db.paymentIntent.findUniqueOrThrow({ where: { id: f1.id } })).status === "PENDING");
    check("webhook with right hash accepted", (await post(`/api/payments/flutterwave/${A.token}`, hook(f1), { "verif-hash": "my-hash" })).status === 200);
    const pf = await db.payment.findFirst({ where: { leaseId: A.lease.id, method: "CARD" } });
    check("card payment recorded as PAID", pf?.status === "PAID" && Number(pf.amount) === 10000, String(pf?.status));

    const f2 = await newFlwIntent(A);
    await setMock("flw", f2.providerRef!, "failed", { amount: 10000, currency: "KES" });
    await post(`/api/payments/flutterwave/${A.token}`, hook(f2), { "verif-hash": "my-hash" });
    check("declined card marks intent FAILED", (await db.paymentIntent.findUniqueOrThrow({ where: { id: f2.id } })).status === "FAILED");

    const f3 = await newFlwIntent(A);
    await setMock("flw", f3.providerRef!, "successful", { amount: 10000, currency: "USD" });
    await post(`/api/payments/flutterwave/${A.token}`, hook(f3), { "verif-hash": "my-hash" });
    check("wrong currency is rejected", (await db.paymentIntent.findUniqueOrThrow({ where: { id: f3.id } })).status === "FAILED");

    // --- subscription (PropCo's own account, platform token)
    const s1 = await newFlwIntent(A, "SUBSCRIPTION", 2500, { plan: "GROWTH", months: 1 });
    await setMock("flw", s1.providerRef!, "successful", { amount: 2500, currency: "KES" });
    await post(`/api/payments/flutterwave/${process.env.PLATFORM_CALLBACK_TOKEN}`, hook(s1), { "verif-hash": process.env.PLATFORM_FLW_WEBHOOK_HASH! });
    const orgA = await db.organization.findUniqueOrThrow({ where: { id: A.org.id } });
    const days = orgA.paidUntil ? Math.round((orgA.paidUntil.getTime() - Date.now()) / 864e5) : 0;
    check("plan paid online switches the plan on for 30 days", orgA.plan === "GROWTH" && days >= 29 && days <= 30, `${orgA.plan} ${days}d`);

    const s2 = await newFlwIntent(B, "SUBSCRIPTION", 1000, { plan: "PRO", months: 1 });
    await setMock("flw", s2.providerRef!, "successful", { amount: 1000, currency: "KES" });
    await post(`/api/payments/flutterwave/${process.env.PLATFORM_CALLBACK_TOKEN}`, hook(s2), { "verif-hash": process.env.PLATFORM_FLW_WEBHOOK_HASH! });
    const orgB = await db.organization.findUniqueOrThrow({ where: { id: B.org.id } });
    check("underpaid plan is not switched on and is flagged", orgB.plan === "FREE" && /contact support/.test(orgB.billingNote ?? ""), `${orgB.plan}`);

    const s3 = await newFlwIntent(B, "SUBSCRIPTION", 7500, { plan: "PRO", months: 1 });
    await setMock("flw", s3.providerRef!, "successful", { amount: 7500, currency: "KES" });
    await post(`/api/payments/flutterwave/${A.token}`, hook(s3), { "verif-hash": "my-hash" });
    check("a company's own token cannot complete a subscription payment", (await db.paymentIntent.findUniqueOrThrow({ where: { id: s3.id } })).status === "PENDING");
  } finally {
    for (const id of created) {
      await db.auditLog.deleteMany({ where: { orgId: id } });
      await db.paymentIntent.deleteMany({ where: { orgId: id } });
      await db.paymentSettings.deleteMany({ where: { orgId: id } });
      await db.payment.deleteMany({ where: { lease: { unit: { property: { orgId: id } } } } });
      await db.lease.deleteMany({ where: { unit: { property: { orgId: id } } } });
      await db.unit.deleteMany({ where: { property: { orgId: id } } });
      await db.property.deleteMany({ where: { orgId: id } });
      await db.tenant.deleteMany({ where: { orgId: id } });
      await db.notification.deleteMany({ where: { orgId: id } });
      await db.owner.deleteMany({ where: { orgId: id } });
      await db.organization.delete({ where: { id } });
    }
    await db.$disconnect();
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
