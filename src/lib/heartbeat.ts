/** Relative imports only: scripts/worker.ts uses this file. */
import type { PrismaClient } from "@prisma/client";

/** Record "this process is alive / this job just succeeded". Never throws. */
export async function beat(db: PrismaClient, name: string, info?: string) {
  try {
    const seenAt = new Date();
    await db.systemHeartbeat.upsert({
      where: { name },
      create: { name, seenAt, info: info ?? null },
      update: { seenAt, info: info ?? null },
    });
  } catch (e) {
    console.error(`[heartbeat] ${name} failed:`, e instanceof Error ? e.message : e);
  }
}
