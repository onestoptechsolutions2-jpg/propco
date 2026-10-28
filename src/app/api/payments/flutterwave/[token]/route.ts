import { prisma } from "@/lib/prisma";
import { reconcileIntent } from "@/lib/payments/reconcile";
import { readJson, resolveToken, safeEqual } from "@/lib/payments/webhook";
import { notifyPaymentReceived } from "@/lib/notify-events";

export const dynamic = "force-dynamic";

/**
 * Flutterwave's charge webhook. It must carry our "secret hash" in the verif-hash header,
 * and even then we only use the body to find the intent: the real result comes from
 * asking Flutterwave to verify the transaction.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const who = await resolveToken(token);
  const body = (await readJson(req)) as { data?: { tx_ref?: string } } | null;
  const given = req.headers.get("verif-hash") ?? "";
  const hash = who?.merchant.flutterwave?.webhookHash;

  if (!who || !hash || !safeEqual(given, hash)) return new Response("Unauthorized", { status: 401 });
  const txRef = body?.data?.tx_ref;
  if (!txRef) return new Response("ok");

  const intent = await prisma.paymentIntent.findFirst({
    where: {
      provider: "FLUTTERWAVE",
      providerRef: txRef,
      status: "PENDING",
      ...(who.orgId ? { orgId: who.orgId, purpose: "RENT" } : { purpose: "SUBSCRIPTION" }),
    },
  });
  if (!intent) return new Response("ok");

  const applied = await reconcileIntent(prisma, intent);
  if (applied.result === "completed" && applied.paymentId) await notifyPaymentReceived(applied.paymentId);
  return new Response("ok");
}
