import type { UtilityType } from "@prisma/client";

/**
 * Compare this period's consumption with the meter's recent history and return
 * a short, plain-language warning, or null when nothing looks unusual.
 * Needs at least two earlier billed readings to have a sense of "usual".
 */
export function detectUsageAlert(args: {
  consumption: number;
  previous: number[]; // most recent billed consumptions, newest first
  occupied: boolean;
  type: UtilityType;
}): string | null {
  const history = args.previous.filter((c) => c > 0).slice(0, 3);
  if (history.length < 2) return null;
  const avg = history.reduce((s, c) => s + c, 0) / history.length;

  if (args.consumption >= avg * 2 && args.consumption - avg >= 1) {
    return `${(args.consumption / avg).toFixed(1)}x higher than usual (about ${avg.toFixed(1)} normally). Check for a leak or a faulty meter.`;
  }
  if (
    args.consumption === 0 &&
    args.occupied &&
    (args.type === "WATER" || args.type === "ELECTRICITY")
  ) {
    return `No usage recorded although the unit is occupied (about ${avg.toFixed(1)} normally). Check the meter reading.`;
  }
  return null;
}
