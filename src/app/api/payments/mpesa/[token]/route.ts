import { prisma } from "@/lib/prisma";
import { parseCallback } from "@/lib/payments/mpesa";
import { reconcileIntent } from "@/lib/payments/reconcile";
import { readJson, resolveToken } from "@/lib/payments/webhook";
import { notifyPaymentReceived } from "@/lib/notify-events";

export const dynamic = "force-dynamic";

// Daraja wants a 200 with this body whatever we decide; we never reveal why we ignored a call.
const ok = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

/**
 * Safaricom's STK Push result. The call is unsigned, so: the URL carries an unguessable
 * token, the CheckoutRequestID must match a pending intent of that merchant, and we
 * confirm the result with Daraja's own status query before any money is recorded.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const who = await resolveToken(token);
  const cb = parseCallback(await readJson(req));
  if (!who || !cb) return ok();

  const intent = await prisma.paymentIntent.findFirst({
    where: {
      provider: "MPESA",
      providerRef: cb.checkoutRequestId,
      status: "PENDING",
      ...(who.orgId ? { orgId: who.orgId, purpose: "RENT" } : { purpose: "SUBSCRIPTION" }),
    },
  });
  if (!intent) return ok();

  const applied = await reconcileIntent(prisma, intent, cb.success ? { receipt: cb.receipt, amount: cb.amount } : undefined);
  if (applied.result === "completed" && applied.paymentId) await notifyPaymentReceived(applied.paymentId);
  return ok();
}
