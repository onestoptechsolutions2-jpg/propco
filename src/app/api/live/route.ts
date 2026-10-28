import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeSignature } from "@/lib/live";

export const dynamic = "force-dynamic";

const POLL_MS = 4_000;
const HEARTBEAT_MS = 25_000;
// Close after a while; the browser reconnects by itself. Stops abandoned tabs holding a database poll forever.
const MAX_LIFETIME_MS = 5 * 60_000;

/**
 * Server-sent events: tells the open page "something changed" so it can refresh.
 * Carries no data, only the signal; the page re-reads what it needs through its
 * normal, permission-checked code. Needs a signed-in, active user in a company.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { orgId: true, active: true, org: { select: { suspendedAt: true } } } });
  if (!me?.active || !me.orgId || me.org?.suspendedAt) return new Response("Forbidden", { status: 403 });
  const orgId = me.orgId;

  const encoder = new TextEncoder();
  let timers: ReturnType<typeof setInterval>[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        timers.forEach(clearInterval);
        timers = [];
        clearTimeout(lifetime);
        try {
          controller.close();
        } catch {}
      };

      let last = await changeSignature(orgId).catch(() => "");
      send("retry: 5000\n\nevent: hello\ndata: ok\n\n");

      let busy = false;
      timers.push(
        setInterval(async () => {
          if (busy) return;
          busy = true;
          try {
            const now = await changeSignature(orgId);
            if (now !== last) {
              last = now;
              send("event: change\ndata: 1\n\n");
            }
          } catch {
            // database blip: stay quiet, try again on the next tick
          } finally {
            busy = false;
          }
        }, POLL_MS),
        setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_MS)
      );
      const lifetime = setTimeout(cleanup, MAX_LIFETIME_MS);
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      timers.forEach(clearInterval);
      timers = [];
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: don't buffer the stream
    },
  });
}
