import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liveness + database check for the container health check and uptime monitors. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "database unavailable" }, { status: 503 });
  }
}
