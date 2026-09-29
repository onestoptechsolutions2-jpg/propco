import type { ChecklistType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MOVE_IN_TASKS = [
  "Lease agreement signed",
  "Tenant ID copy collected",
  "Security deposit received",
  "First month's rent received",
  "Opening meter readings recorded (water, electricity)",
  "Keys handed over",
  "House rules and emergency contacts explained",
];

export const MOVE_OUT_TASKS = [
  "Notice to vacate received",
  "Final meter readings recorded",
  "Unit inspected together with the tenant",
  "Keys returned",
  "Forwarding address and refund details taken",
];

export const DEFAULT_INVENTORY = [
  "Walls and paint",
  "Floors and tiles",
  "Doors and locks",
  "Windows and curtain rails",
  "Electrical sockets and lights",
  "Plumbing (taps, sink, toilet, shower)",
  "Kitchen fittings",
  "Cupboards and wardrobes",
];

export const CONDITIONS = ["GOOD", "FAIR", "DAMAGED"] as const;

/**
 * Create the move-in or move-out checklist for a lease if it doesn't exist.
 * A move-out list reuses the move-in inventory so the two can be compared
 * line by line.
 */
export async function ensureChecklist(leaseId: string, type: ChecklistType) {
  const existing = await prisma.checklist.findUnique({
    where: { leaseId_type: { leaseId, type } },
  });
  if (existing) return existing;

  let inventory = DEFAULT_INVENTORY;
  if (type === "MOVE_OUT") {
    const moveIn = await prisma.checklist.findUnique({
      where: { leaseId_type: { leaseId, type: "MOVE_IN" } },
      include: { items: { where: { category: "INVENTORY" }, orderBy: { sortOrder: "asc" } } },
    });
    if (moveIn && moveIn.items.length > 0) inventory = moveIn.items.map((i) => i.label);
  }

  const tasks = type === "MOVE_IN" ? MOVE_IN_TASKS : MOVE_OUT_TASKS;
  return prisma.checklist.create({
    data: {
      leaseId,
      type,
      items: {
        create: [
          ...tasks.map((label, i) => ({ category: "TASK", label, sortOrder: i })),
          ...inventory.map((label, i) => ({
            category: "INVENTORY",
            label,
            sortOrder: 100 + i,
            condition: type === "MOVE_IN" ? "GOOD" : null,
          })),
        ],
      },
    },
  });
}

/** What the tenant owes / is owed when they leave. */
export async function computeSettlement(leaseId: string) {
  const lease = await prisma.lease.findUniqueOrThrow({
    where: { id: leaseId },
    include: {
      checklists: { where: { type: "MOVE_OUT" }, include: { items: true } },
      readings: { where: { status: "UNPAID" }, include: { meter: true } },
      payments: { where: { status: { in: ["PENDING", "LATE", "FAILED"] }, dueDate: { lte: new Date() } } },
    },
  });

  const damageItems = (lease.checklists[0]?.items ?? []).filter((i) => Number(i.cost) > 0);
  const damages = damageItems.reduce((s, i) => s + Number(i.cost), 0);
  const utilities = lease.readings.reduce((s, r) => s + Number(r.amount), 0);
  const rentArrears = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const deposit = Number(lease.depositAmount ?? 0);
  const deductions = damages + utilities + rentArrears;

  return {
    lease,
    deposit,
    damages,
    damageItems,
    utilities,
    unpaidBills: lease.readings,
    rentArrears,
    arrearPayments: lease.payments,
    deductions,
    refund: deposit - deductions, // negative = tenant still owes
  };
}
