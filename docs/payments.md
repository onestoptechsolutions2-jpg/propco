# Online payments

Tenants can pay rent from their phone, and companies can pay for their PropCo plan online. Everything that existed before keeps working: cash, bank transfers and pasted M-Pesa messages (**Confirm M-Pesa**) are recorded the same way and produce the same receipts and books entries.

## What is supported

| Method | Provider | How the tenant pays | Money goes to |
|---|---|---|---|
| M-Pesa prompt | Safaricom Daraja (STK Push) | A prompt appears on their phone; they enter their PIN | The company's own paybill or till |
| Card, bank, mobile money | Flutterwave | They open a link you send (for example on WhatsApp) | The company's own Flutterwave account |
| Cash, bank, pasted M-Pesa SMS | Manual (unchanged) | Recorded by staff | n/a |

Rent always goes to **the company's own** merchant account. PropCo never holds tenant money. Plan payments go to **PropCo's** account, configured by the platform operator through environment variables.

Providers are configurable per company: switch either on or off in **Online payments** (menu, Account). A company can use one, both or neither.

## How a payment flows

```
Staff: "Request payment"            Tenant                    Provider
        │                              │                         │
        ├─ create PaymentIntent (PENDING)                        │
        ├─ call provider ───────────────────────────────────────▶│  STK prompt / checkout link
        │                              │◀────────────────────────┤
        │                              ├─ enters PIN / pays ────▶│
        │◀────────────── webhook (result) ───────────────────────┤
        ├─ ask provider "is this really paid?" ─────────────────▶│  (never trust the webhook alone)
        │◀───────────────────────────────────────────────────────┤
        └─ applyOutcome(): intent SUCCESS + rent marked PAID, in ONE transaction
```

1. **Request.** Staff press *Request payment* on a lease (or a company presses *Pay online* on Billing). A `PaymentIntent` row records the attempt before the provider is called.
2. **Pay.** The tenant pays on their phone or on Flutterwave's page. Card details never touch PropCo.
3. **Notify.** The provider calls a webhook on PropCo.
4. **Confirm.** PropCo asks the provider whether the payment is real (M-Pesa STK Query / Flutterwave verify-by-reference). Only that answer counts.
5. **Apply.** In one database transaction the intent is claimed (`PENDING` to `SUCCESS`) and the effect is applied: the lease's open payment is marked PAID (or a new PAID payment is created), or the plan and `paidUntil` are extended. The receipt, audit log, books entry and tenant message follow from the normal payment record.
6. **Backstop.** The worker checks unfinished intents every 2 minutes, so a lost webhook still completes. An M-Pesa prompt that is never answered is marked FAILED after 15 minutes; a Flutterwave link after 24 hours.

Pages refresh themselves when the payment lands (see *Live updates* in the [features guide](features.md)).

## Setting up M-Pesa (Daraja)

You need a Safaricom developer account at <https://developer.safaricom.co.ke>.

**Sandbox (testing, no real money)**
1. Create an app and enable **Lipa na M-Pesa Online (STK Push)**.
2. Copy the app's **Consumer Key** and **Consumer Secret**.
3. In PropCo: *Online payments*, tick M-Pesa, environment **Sandbox**, account type **Paybill**, shortcode `174379`, and the public test **passkey** from Safaricom's docs ("Test Credentials").
4. Save, then press **Test M-Pesa keys**. It signs in to Safaricom and moves no money.
5. On a lease, press *Request payment*. In the sandbox, use the Daraja simulator to complete it.

**Production**
1. Complete Safaricom's **Go Live** process for your paybill or till. They give you production keys and a passkey.
2. In PropCo choose environment **Production**, your real shortcode (and, for a *Till*, the till number), and the production keys.
3. Your PropCo address must be reachable over HTTPS from the internet: Safaricom calls it back. `localhost` will not work.

The callback address is generated for you (shown on the settings page) and sent with every request. You do not paste it into the Safaricom portal.

## Setting up Flutterwave

1. In the Flutterwave dashboard, *Settings, API*: copy the **Secret key**.
2. Choose a long random **secret hash** (any string you invent).
3. In *Settings, Webhooks*: set the URL shown on PropCo's *Online payments* page and enter **the same secret hash**.
4. In PropCo: tick the Flutterwave box, paste the secret key and the secret hash, save, press **Test Flutterwave key**.

## Plan payments (platform operator)

PropCo's own account is configured with environment variables (see [deployment](deployment.md)). Without them the *Pay online* buttons on Billing stay hidden and the manual flow (pay the till, share the proof) remains. A successful payment switches the plan on for 30 days per month paid, extending from the current end date if still active. A payment lower than the price does **not** change the plan; it is recorded and flagged in the billing note for a person to resolve.

## Security model

| Risk | Defence |
|---|---|
| Stolen database leaks provider keys | Secrets are stored encrypted (AES-256-GCM). The key is `PAYMENTS_ENCRYPTION_KEY` (falls back to `AUTH_SECRET`). Secret fields are never shown again after saving; leaving one blank keeps the saved value. |
| Someone posts a fake "paid" webhook | Daraja callbacks are unsigned, so each company's webhook URL contains a 48-character random token; the `CheckoutRequestID` must match a pending intent of that same company; and the result is **confirmed with Safaricom** before anything is recorded. Flutterwave webhooks must carry the secret hash (`verif-hash`, compared in constant time) and are then verified with Flutterwave. |
| Replay or duplicate delivery | Completion is a single guarded database transaction. Five simultaneous identical callbacks pay exactly once (tested). |
| One company completing another's payment | The token selects the merchant; the intent must belong to that company and purpose. A company token cannot complete a plan payment, and vice versa. |
| Paying the wrong amount or currency | The amount actually paid is recorded and any difference from the request is noted on the intent. Wrong currency is rejected. Plan payments below the price do not activate the plan. |
| Provider unreachable | Intents stay PENDING and are re-checked by the worker. Nothing is credited on an error. |
| Card data | Cards are entered on Flutterwave's hosted page. PropCo never sees or stores card numbers. |

Who can do what: *Online payments* settings need the **Team and roles** permission (`team.manage`); requesting a tenant payment needs `rent.manage`; paying for a plan needs `billing.manage`. Every request, settings change and online payment is written to the activity log.

## Where things are in the code

| Path | Purpose |
|---|---|
| `src/lib/payments/mpesa.ts` | Daraja: token, STK push, STK query, callback parsing |
| `src/lib/payments/flutterwave.ts` | Flutterwave: checkout link, verify by reference, key check |
| `src/lib/payments/reconcile.ts` | `applyOutcome` (the one place money is applied), `reconcileIntent`, `reconcilePending` (worker) |
| `src/lib/payments/config.ts`, `crypto.ts` | Per-company settings, platform settings, encryption |
| `src/lib/payments/start.ts` | Creates the intent and calls the provider |
| `src/app/api/payments/mpesa/[token]`, `.../flutterwave/[token]` | Webhook endpoints |
| `src/app/(app)/settings/payments` | Settings screen |
| `src/app/(app)/rent/[leaseId]/OnlinePayments.tsx` | "Ask for payment" panel |
| `scripts/payments-test/` | Mock gateway and end-to-end test |

Data: `PaymentSettings` (one row per company) and `PaymentIntent` (one row per attempt, never deleted).

## Testing

No real provider is needed. A mock gateway stands in for Safaricom and Flutterwave:

```sh
pnpm build
DATABASE_URL=postgresql://propco:propco@localhost:5432/propco?schema=public sh scripts/payments-test/run.sh
```

It starts the mock and the app, then runs 26 checks: encryption at rest, the M-Pesa happy path, replayed and forged callbacks, another company's token, five simultaneous callbacks, a lost callback recovered by the worker, expiry, Flutterwave hash checks, declined cards, wrong currency, plan activation, underpaid plans. It creates its own test companies and removes them afterwards.

Before going live, also run one real sandbox payment end to end (the mock cannot prove Safaricom's or Flutterwave's real behaviour).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "M-Pesa sign-in failed" | Wrong consumer key or secret, or sandbox keys with *Production* selected (or the reverse) |
| Prompt never arrives | Phone number format; sandbox numbers only work with Safaricom's simulator; shortcode and passkey do not match |
| Prompt completed but rent stays unpaid | PropCo's address is not reachable from the internet (the worker will still catch it within a few minutes if the status query works); check the `PENDING` intents |
| Flutterwave webhook returns 401 | The secret hash in Flutterwave differs from the one saved in PropCo |
| "That payment method is not set up yet" | The provider is switched off, or a key is missing; use the *Test* buttons |
| Settings suddenly say "not configured" after a redeploy | `PAYMENTS_ENCRYPTION_KEY` (or `AUTH_SECRET`) changed, so saved secrets cannot be decrypted. Re-enter them |

## Adding another provider (Paystack, Pesapal, ...)

1. Add `src/lib/payments/<provider>.ts` with: create a checkout, and verify a payment by your own reference, returning an `Outcome`.
2. Add its fields to `PaymentSettings` (encrypted secrets) and to `config.ts`.
3. Add a webhook route that checks the provider's signature, finds the intent, and calls `reconcileIntent`. Never credit from the webhook body.
4. Branch on the provider in `start.ts` and `reconcile.ts` (`reconcileIntent`).
5. Extend `scripts/payments-test` with the provider's cases and update this page.

## Not included yet

- **M-Pesa paybill payments without a prompt** (tenant pays your paybill from their menu; Daraja C2B). Today those are recorded with *Confirm M-Pesa* (paste the SMS).
- Refunds and reversals (do these in the provider's dashboard, then correct the payment in PropCo).
- Automatic matching of bank statements.
