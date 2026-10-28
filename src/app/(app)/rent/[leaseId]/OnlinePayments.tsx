import { prisma } from "@/lib/prisma";
import { loadOrgMerchant } from "@/lib/payments/config";
import { available } from "@/lib/payments/start";
import { whatsappLink } from "@/lib/whatsapp";
import { requestRentPayment } from "./pay-actions";

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const STATUS: Record<string, string> = {
  PENDING: "bg-ink-light/10 text-ink",
  SUCCESS: "bg-accent-light text-accent",
  FAILED: "bg-danger/10 text-danger",
  CANCELLED: "bg-background text-muted",
};

/** "Ask for payment" panel on a lease: M-Pesa prompt or payment link, plus recent requests. */
export async function OnlinePayments({
  lease,
  orgId,
  defaultAmount,
  notice,
}: {
  lease: { id: string; tenant: { name: string; phone: string | null }; unit: { label: string } };
  orgId: string;
  defaultAmount: number;
  notice: { requested?: string; payError?: string };
}) {
  const [merchant, intents] = await Promise.all([
    loadOrgMerchant(prisma, orgId),
    prisma.paymentIntent.findMany({ where: { leaseId: lease.id, purpose: "RENT" }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const providers = available(merchant);

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface p-5">
      <h3 className="font-serif text-lg text-ink">Ask for payment</h3>

      {notice.payError && <p className="mt-3 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{notice.payError}</p>}
      {notice.requested === "mpesa" && (
        <p className="mt-3 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">
          Prompt sent. Ask {lease.tenant.name.split(" ")[0]} to enter their M-Pesa PIN. This page updates when the money arrives.
        </p>
      )}
      {notice.requested === "link" && <p className="mt-3 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">Link created. Send it below.</p>}

      {providers.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Online payments are not set up yet. Admins can add M-Pesa or card keys under Online payments in the menu.
        </p>
      ) : (
        <form action={requestRentPayment.bind(null, lease.id)} className="mt-3 flex flex-col gap-3">
          <select name="provider" className={input} defaultValue={providers[0]}>
            {providers.includes("MPESA") && <option value="MPESA">M-Pesa prompt to their phone</option>}
            {providers.includes("FLUTTERWAVE") && <option value="FLUTTERWAVE">Card / bank / mobile money link</option>}
          </select>
          <input name="amount" type="number" min="1" step="1" defaultValue={defaultAmount} required className={input} aria-label="Amount in KES" />
          <input name="phone" defaultValue={lease.tenant.phone ?? ""} placeholder="Phone, e.g. 0712 345 678" className={input} aria-label="Phone number" />
          <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">Request payment</button>
        </form>
      )}

      {intents.length > 0 && (
        <ul className="mt-4 divide-y divide-border text-sm">
          {intents.map((i) => {
            const share =
              i.checkoutUrl && i.status === "PENDING"
                ? whatsappLink(lease.tenant.phone, `Hello ${lease.tenant.name.split(" ")[0]}, please pay your rent of KES ${Number(i.amount).toLocaleString()} for ${lease.unit.label} here: ${i.checkoutUrl}`)
                : null;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  KES {Number(i.amount).toLocaleString()} · {i.provider === "MPESA" ? "M-Pesa" : "Link"} · {i.createdAt.toLocaleDateString("en-GB")}
                  {i.failureReason && <span className="block text-xs text-muted">{i.failureReason}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {share && (
                    <a href={share} target="_blank" rel="noopener noreferrer" className="rounded bg-[#1f9d55] px-2 py-1 text-xs font-medium text-white">
                      Send on WhatsApp
                    </a>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[i.status]}`}>{i.status.toLowerCase()}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
