import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PLANS, orgStatus } from "@/lib/plans";
import { whatsappLink } from "@/lib/whatsapp";
import type { Plan } from "@prisma/client";

async function requestUpgrade(plan: Plan) {
  "use server";
  const user = await requirePermission("billing.manage");
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { billingNote: `Upgrade to ${plan} requested on ${new Date().toISOString().slice(0, 10)}` },
  });
  revalidatePath("/billing");
  redirect("/billing");
}

async function sharePaymentProof(formData: FormData) {
  "use server";
  const user = await requirePermission("billing.manage");
  const text = String(formData.get("proof") ?? "").trim().slice(0, 600);
  if (text.length < 10) redirect("/billing");
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { billingNote: `Payment proof shared ${new Date().toISOString().slice(0, 10)}: ${text}` },
  });
  revalidatePath("/billing");
  redirect("/billing?shared=1");
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ shared?: string }> }) {
  const { shared } = await searchParams;
  const user = await requirePermission("billing.manage");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const units = await prisma.unit.count({ where: { property: { orgId: org.id } } });
  const status = orgStatus(org);
  const till = process.env.BILLING_MPESA_TILL;
  const supportPhone = process.env.BILLING_WHATSAPP;

  const limitLabel = status.maxUnits === Infinity ? "unlimited" : status.maxUnits;
  const paidUntil = org.paidUntil?.toLocaleDateString();

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl text-ink">Billing</h1>
      <p className="mt-1 text-sm text-muted">{org.name}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Current plan</p>
          <p className="mt-2 font-serif text-2xl text-ink">
            {status.inTrial ? "Free trial" : PLANS[status.effectivePlan].label}
          </p>
          <p className="mt-1 text-xs text-muted">
            {status.inTrial
              ? `${status.trialDaysLeft} day${status.trialDaysLeft === 1 ? "" : "s"} left, everything unlocked`
              : status.subscribed
                ? `Paid until ${paidUntil}`
                : status.lapsed
                  ? `Your ${PLANS[org.plan].label} plan expired ${paidUntil}`
                  : "Free forever"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Units in use</p>
          <p className="mt-2 font-serif text-2xl text-ink">
            {units} <span className="text-base text-muted">/ {limitLabel}</span>
          </p>
          {status.maxUnits !== Infinity && units >= status.maxUnits && (
            <p className="mt-1 text-xs text-danger">You&apos;ve reached your limit. Upgrade to add more.</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Account number</p>
          <p className="mt-2 font-mono text-sm text-ink">{org.id.slice(-8).toUpperCase()}</p>
          <p className="mt-1 text-xs text-muted">Use this as the payment reference.</p>
        </div>
      </div>

      <h2 className="mt-10 font-serif text-xl text-ink">Choose a plan</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(PLANS) as Plan[]).map((key) => {
          const p = PLANS[key];
          const current = !status.inTrial && status.effectivePlan === key;
          const message = `Hi, I'd like to move ${org.name} (account ${org.id.slice(-8).toUpperCase()}) to the ${p.label} plan.`;
          const link = supportPhone ? whatsappLink(supportPhone, message) : null;
          return (
            <div key={key} className={`flex flex-col rounded-lg border bg-surface p-5 ${current ? "border-accent" : "border-border"}`}>
              <h3 className="font-serif text-lg text-ink">{p.label}</h3>
              <p className="mt-2 font-serif text-2xl text-ink">
                {p.priceKes === 0 ? "Free" : `KES ${p.priceKes.toLocaleString()}`}
              </p>
              <p className="text-xs text-muted">{p.priceKes === 0 ? "forever" : "per month"}</p>
              <p className="mt-3 text-sm">{p.blurb}</p>
              <div className="mt-auto pt-4">
                {current ? (
                  <span className="text-xs font-medium text-accent">Your plan</span>
                ) : p.priceKes > 0 ? (
                  <form action={requestUpgrade.bind(null, key)} className="flex flex-col gap-2">
                    <button className="rounded bg-ink px-3 py-2 text-xs font-medium text-white hover:bg-ink-light">
                      Choose {p.label}
                    </button>
                    {link && (
                      <a href={link} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">
                        Message us on WhatsApp
                      </a>
                    )}
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-accent-light p-5 text-sm text-ink">
        <h3 className="font-serif text-lg">How to pay</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Press “Choose” on the plan you want.</li>
          <li>
            Pay the monthly amount by M-Pesa {till ? <strong>{till}</strong> : "(payment details coming from your PropCo contact)"}, using account number{" "}
            <strong>{org.id.slice(-8).toUpperCase()}</strong> as the reference.
          </li>
          <li>We switch your plan on, usually within a few hours. You&apos;ll see the new limit here.</li>
        </ol>
        {org.billingNote && <p className="mt-3 text-xs text-muted">Last request: {org.billingNote}</p>}

        <form action={sharePaymentProof} className="mt-5 border-t border-ink/10 pt-4">
          <p className="font-medium">Already paid? Share your proof of payment</p>
          <textarea
            name="proof"
            required
            rows={3}
            placeholder="Paste the M-Pesa confirmation message here"
            className="mt-2 w-full rounded border border-border bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <button className="mt-2 rounded bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-ink-light">
            Send proof
          </button>
          {shared && <p className="mt-2 text-xs text-accent">Thank you. We will activate your plan once we confirm it.</p>}
          {supportPhone && (
            <p className="mt-2 text-xs text-muted">
              You can also forward the M-Pesa message to us on WhatsApp{" "}
              <a
                className="text-accent hover:underline"
                target="_blank"
                rel="noopener"
                href={whatsappLink(supportPhone, `Payment proof for ${org.name} (account ${org.id.slice(-8).toUpperCase()}):`) ?? "#"}
              >
                here
              </a>
              .
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
