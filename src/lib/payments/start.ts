import { headers } from "next/headers";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { appBaseUrl, loadOrgMerchant, loadPlatformMerchant } from "./config";
import { stkPush } from "./mpesa";
import { createCheckout } from "./flutterwave";
import type { MerchantConfig } from "./types";

export type Provider = "MPESA" | "FLUTTERWAVE";

/** Which providers a merchant account can use right now. */
export const available = (m: MerchantConfig | null): Provider[] =>
  [m?.mpesa ? "MPESA" : null, m?.flutterwave ? "FLUTTERWAVE" : null].filter(Boolean) as Provider[];

async function baseUrl() {
  const h = await headers();
  return appBaseUrl(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

type StartArgs = {
  orgId: string;
  purpose: "RENT" | "SUBSCRIPTION";
  provider: Provider;
  amount: number;
  phone?: string | null;
  payer: { name: string; email?: string | null };
  description: string;
  reference: string; // what the customer sees: unit, account number
  createdById?: string;
  leaseId?: string;
  paymentId?: string;
  plan?: Plan;
  months?: number;
};

/**
 * Create the intent first, then call the provider, so there is always a record of
 * the attempt. If the provider refuses, the intent is marked FAILED and the error is
 * shown to the user as-is (they are staff, and the message is what they need to fix it).
 */
export async function startPayment(a: StartArgs) {
  if (!(a.amount > 0)) throw new Error("Enter an amount greater than zero.");
  const merchant = a.purpose === "SUBSCRIPTION" ? loadPlatformMerchant() : await loadOrgMerchant(prisma, a.orgId);
  if (!available(merchant).includes(a.provider)) {
    throw new Error(
      a.purpose === "RENT"
        ? "That payment method is not set up yet. Open Online payments in the menu to add your keys."
        : "Online plan payments are not switched on yet. Please pay by M-Pesa and share your proof instead."
    );
  }

  const intent = await prisma.paymentIntent.create({
    data: {
      orgId: a.orgId,
      purpose: a.purpose,
      provider: a.provider,
      amount: a.amount,
      phone: a.phone ?? null,
      leaseId: a.leaseId,
      paymentId: a.paymentId,
      plan: a.plan,
      months: a.months,
      createdById: a.createdById,
    },
  });

  const root = await baseUrl();
  try {
    if (a.provider === "MPESA") {
      if (!a.phone) throw new Error("Enter the phone number to send the M-Pesa prompt to.");
      const sent = await stkPush(merchant!.mpesa!, {
        amount: a.amount,
        phone: a.phone,
        reference: a.reference,
        description: a.description,
        callbackUrl: `${root}/api/payments/mpesa/${merchant!.callbackToken}`,
      });
      return prisma.paymentIntent.update({ where: { id: intent.id }, data: { providerRef: sent.checkoutRequestId } });
    }
    const txRef = `pi_${intent.id}`;
    const link = await createCheckout(merchant!.flutterwave!, {
      txRef,
      amount: a.amount,
      currency: "KES",
      redirectUrl: `${root}/pay/done`,
      email: a.payer.email || "payments@propco.invalid",
      phone: a.phone ?? undefined,
      name: a.payer.name,
      title: a.description,
    });
    return prisma.paymentIntent.update({ where: { id: intent.id }, data: { providerRef: txRef, checkoutUrl: link } });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Provider error";
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED", failureReason: reason.slice(0, 300), completedAt: new Date() } });
    throw new Error(reason);
  }
}

export const planPrice = (plan: Plan, months: number) => PLANS[plan].priceKes * months;
