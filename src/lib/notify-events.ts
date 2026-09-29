import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

const kes = (v: unknown) =>
  `KES ${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Owner: rent received on one of their properties. */
export async function notifyPaymentReceived(paymentId: string) {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { lease: { include: { tenant: true, unit: { include: { property: { include: { owner: true } } } } } } },
  });
  if (!p || p.status !== "PAID") return;
  const { owner } = p.lease.unit.property;
  await notify(prisma, {
    event: "PAYMENT_RECEIVED",
    to: owner,
    subject: "Rent payment received",
    body: `${kes(p.amount)} received from ${p.lease.tenant.name} for ${p.lease.unit.property.name} · ${p.lease.unit.label}.`,
    dedupeKey: `PAYMENT_RECEIVED:${p.id}`,
  });
}

/** Owner: payout has been paid. */
export async function notifyPayoutSent(payoutId: string) {
  const p = await prisma.payout.findUnique({ where: { id: payoutId }, include: { owner: true } });
  if (!p || p.status !== "PAID") return;
  const month = p.periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  await notify(prisma, {
    event: "PAYOUT_SENT",
    to: p.owner,
    subject: `Your ${month} payout has been sent`,
    body: `${kes(p.netAmount)} sent via ${p.method}${p.reference ? ` (ref ${p.reference})` : ""}. Open Owner payouts in PropCo and tap Statement for the full breakdown.`,
    dedupeKey: `PAYOUT_SENT:${p.id}`,
  });
}

const requestInclude = {
  supplier: true,
  unit: {
    include: {
      property: { include: { owner: true } },
      leases: { where: { status: "ACTIVE" as const }, include: { tenant: true } },
    },
  },
};

/** Supplier: a job was assigned to them. */
export async function notifyMaintenanceAssigned(requestId: string) {
  const r = await prisma.maintenanceRequest.findUnique({ where: { id: requestId }, include: requestInclude });
  if (!r?.supplier) return;
  await notify(prisma, {
    event: "MAINTENANCE_ASSIGNED",
    to: r.supplier,
    subject: "New maintenance job assigned",
    body: `${r.description} — ${r.unit.property.name}, ${r.unit.label}.${r.costEstimate ? ` Estimate: ${kes(r.costEstimate)}.` : ""}`,
    dedupeKey: `MAINTENANCE_ASSIGNED:${r.id}:${r.supplier.id}`,
  });
}

/** Owner and current tenant: job finished. */
export async function notifyMaintenanceResolved(requestId: string) {
  const r = await prisma.maintenanceRequest.findUnique({ where: { id: requestId }, include: requestInclude });
  if (!r || r.status !== "DONE") return;
  const where = `${r.unit.property.name}, ${r.unit.label}`;
  await notify(prisma, {
    event: "MAINTENANCE_RESOLVED",
    to: r.unit.property.owner,
    subject: "Maintenance completed",
    body: `"${r.description}" at ${where} is done. Cost: ${kes(r.actualCost)}.`,
    dedupeKey: `MAINTENANCE_RESOLVED:${r.id}:owner`,
  });
  const tenant = r.unit.leases[0]?.tenant;
  if (tenant) {
    await notify(prisma, {
      event: "MAINTENANCE_RESOLVED",
      to: tenant,
      subject: "Maintenance completed",
      body: `Your maintenance request "${r.description}" at ${where} has been completed.`,
      dedupeKey: `MAINTENANCE_RESOLVED:${r.id}:tenant`,
    });
  }
}

/** Supplier: they have been paid. */
export async function notifySupplierPaid(requestId: string) {
  const r = await prisma.maintenanceRequest.findUnique({ where: { id: requestId }, include: { supplier: true } });
  if (!r?.supplier || !r.supplierPaidAt) return;
  await notify(prisma, {
    event: "SUPPLIER_PAID",
    to: r.supplier,
    subject: "Payment sent",
    body: `${kes(r.actualCost)} paid for "${r.description}" via ${r.supplierPayMethod}${r.supplierPayRef ? ` (ref ${r.supplierPayRef})` : ""}.`,
    dedupeKey: `SUPPLIER_PAID:${r.id}`,
  });
}

/** Tenant: a utility bill was recorded against their lease. */
export async function notifyUtilityBill(readingId: string) {
  const r = await prisma.meterReading.findUnique({
    where: { id: readingId },
    include: { meter: { include: { unit: { include: { property: true } } } }, lease: { include: { tenant: true } } },
  });
  if (!r?.lease || Number(r.amount) <= 0) return;
  const kind = r.meter.type.charAt(0) + r.meter.type.slice(1).toLowerCase();
  const detail =
    r.meter.mode === "METERED"
      ? `${Number(r.consumption)} ${r.meter.unitName} used (${Number(r.previousReading)} to ${Number(r.reading)})`
      : "monthly fee";
  await notify(prisma, {
    event: "UTILITY_BILL",
    to: r.lease.tenant,
    subject: `${kind} bill`,
    body: `${kind} for ${r.meter.unit.property.name} · ${r.meter.unit.label}: ${detail}. Amount due: ${kes(r.amount)}.`,
    dedupeKey: `UTILITY_BILL:${r.id}`,
  });
}

/** Tenant: move-out settlement summary. */
export async function notifySettlement(leaseId: string) {
  const l = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { tenant: true, unit: { include: { property: true } } },
  });
  if (!l || !l.depositSettledAt) return;
  const refund = Number(l.depositRefund ?? 0);
  await notify(prisma, {
    event: "MOVE_OUT_SETTLED",
    to: l.tenant,
    subject: "Move-out completed",
    body:
      `Your move-out from ${l.unit.property.name} · ${l.unit.label} is complete. ` +
      (refund >= 0
        ? `Deposit refund: ${kes(refund)} (after deductions of ${kes(l.depositDeductions)}).`
        : `Deductions of ${kes(l.depositDeductions)} exceed your deposit; balance due: ${kes(-refund)}.`),
    dedupeKey: `MOVE_OUT_SETTLED:${l.id}`,
  });
}
