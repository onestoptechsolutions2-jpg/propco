import { headers } from "next/headers";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/payments/config";
import { saveSettings, testSettings } from "./actions";

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const label = "mb-1 block text-xs font-medium text-muted";

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; tested?: string; error?: string }>;
}) {
  const user = await requirePermission("team.manage");
  const { saved, tested, error } = await searchParams;
  const s = await prisma.paymentSettings.findUnique({ where: { orgId: user.orgId } });
  const h = await headers();
  const root = appBaseUrl(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const stored = (v: string | null | undefined) => (v ? "Saved. Leave blank to keep it." : "");

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Online payments</h1>
      <p className="mt-1 text-sm text-muted">
        Let tenants pay rent from their phone. Money goes straight to <strong>your</strong> M-Pesa or Flutterwave account, never through PropCo. Cash, bank and pasted M-Pesa messages keep working as before.
      </p>

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {saved && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">Saved.</p>}
      {tested && (
        <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">
          {tested === "mpesa" ? "M-Pesa accepted your keys." : "Flutterwave accepted your key."}
        </p>
      )}

      <form action={saveSettings} className="mt-6 flex flex-col gap-6">
        <section className="rounded-lg border border-border bg-surface p-5">
          <label className="flex items-center gap-2 font-serif text-lg text-ink">
            <input type="checkbox" name="mpesaEnabled" defaultChecked={s?.mpesaEnabled} /> M-Pesa (Safaricom Daraja)
          </label>
          <p className="mt-1 text-xs text-muted">The tenant gets a prompt on their phone and enters their PIN. Get the keys from developer.safaricom.co.ke.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Environment</span>
              <select name="mpesaEnv" defaultValue={s?.mpesaEnv ?? "sandbox"} className={input}>
                <option value="sandbox">Sandbox (testing, no real money)</option>
                <option value="production">Production (real money)</option>
              </select>
            </div>
            <div>
              <span className={label}>Account type</span>
              <select name="mpesaKind" defaultValue={s?.mpesaKind ?? "PAYBILL"} className={input}>
                <option value="PAYBILL">Paybill</option>
                <option value="TILL">Till (Buy Goods)</option>
              </select>
            </div>
            <div>
              <span className={label}>Paybill / store number (shortcode)</span>
              <input name="mpesaShortcode" defaultValue={s?.mpesaShortcode ?? ""} className={input} inputMode="numeric" />
            </div>
            <div>
              <span className={label}>Till number (only for Till)</span>
              <input name="mpesaPartyB" defaultValue={s?.mpesaPartyB ?? ""} className={input} inputMode="numeric" />
            </div>
            <div>
              <span className={label}>Consumer key</span>
              <input name="mpesaConsumerKey" type="password" autoComplete="off" placeholder={stored(s?.mpesaConsumerKeyEnc)} className={input} />
            </div>
            <div>
              <span className={label}>Consumer secret</span>
              <input name="mpesaConsumerSecret" type="password" autoComplete="off" placeholder={stored(s?.mpesaConsumerSecretEnc)} className={input} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Passkey (Lipa na M-Pesa Online)</span>
              <input name="mpesaPasskey" type="password" autoComplete="off" placeholder={stored(s?.mpesaPasskeyEnc)} className={input} />
            </div>
          </div>
          {s && (
            <p className="mt-4 break-all rounded bg-background px-3 py-2 text-xs text-muted">
              Callback URL (Safaricom calls this; nothing to paste, it is sent with every request): <br />
              <code>{root}/api/payments/mpesa/{s.callbackToken}</code>
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <label className="flex items-center gap-2 font-serif text-lg text-ink">
            <input type="checkbox" name="flutterwaveEnabled" defaultChecked={s?.flutterwaveEnabled} /> Cards, bank and mobile money (Flutterwave)
          </label>
          <p className="mt-1 text-xs text-muted">You send the tenant a payment link. Get the keys from your Flutterwave dashboard, Settings, API.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Secret key</span>
              <input name="flutterwaveSecretKey" type="password" autoComplete="off" placeholder={stored(s?.flutterwaveSecretKeyEnc)} className={input} />
            </div>
            <div>
              <span className={label}>Webhook secret hash (you choose it)</span>
              <input name="flutterwaveHash" type="password" autoComplete="off" placeholder={stored(s?.flutterwaveHashEnc)} className={input} />
            </div>
          </div>
          {s && (
            <p className="mt-4 break-all rounded bg-background px-3 py-2 text-xs text-muted">
              In Flutterwave, Settings, Webhooks, set this URL and the same secret hash as above: <br />
              <code>{root}/api/payments/flutterwave/{s.callbackToken}</code>
            </p>
          )}
        </section>

        <div>
          <button className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save</button>
        </div>
      </form>

      {s && (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
          <form action={testSettings}>
            <input type="hidden" name="which" value="mpesa" />
            <button className="rounded border border-border px-4 py-2 text-sm hover:bg-background">Test M-Pesa keys</button>
          </form>
          <form action={testSettings}>
            <input type="hidden" name="which" value="flutterwave" />
            <button className="rounded border border-border px-4 py-2 text-sm hover:bg-background">Test Flutterwave key</button>
          </form>
          <p className="self-center text-xs text-muted">Save first, then test. Testing never moves money.</p>
        </div>
      )}
    </div>
  );
}
