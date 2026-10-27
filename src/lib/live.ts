import { prisma } from "@/lib/prisma";

/**
 * A short string that changes whenever something a user would want to see live
 * changes for this company: rent payments, M-Pesa proofs, messages, repairs,
 * supplier invoices and cash-book entries. One cheap query, run every few
 * seconds per open tab, so recent rows only (the date columns are indexed).
 */
export async function changeSignature(orgId: string): Promise<string> {
  const [row] = await prisma.$queryRaw<{ sig: string }[]>`
    SELECT concat_ws('|',
      (SELECT coalesce(max(p."updatedAt")::text, '') || ':' || count(*)
         FROM "Payment" p
         JOIN "Lease" l ON l.id = p."leaseId"
         JOIN "Unit" u ON u.id = l."unitId"
         JOIN "Property" pr ON pr.id = u."propertyId"
        WHERE pr."orgId" = ${orgId} AND p."dueDate" > now() - interval '90 days'),
      (SELECT coalesce(max("createdAt")::text, '') || ':' || count(*) FILTER (WHERE status = 'PENDING')
         FROM "PaymentProof" WHERE "orgId" = ${orgId} AND "createdAt" > now() - interval '90 days'),
      (SELECT coalesce(max("createdAt")::text, '') || ':' || count(*) FILTER (WHERE status IN ('QUEUED', 'SENDING'))
         FROM "Notification" WHERE "orgId" = ${orgId} AND "createdAt" > now() - interval '90 days'),
      (SELECT coalesce(max(m."updatedAt")::text, '') || ':' || count(*)
         FROM "MaintenanceRequest" m
         JOIN "Unit" u ON u.id = m."unitId"
         JOIN "Property" pr ON pr.id = u."propertyId"
        WHERE pr."orgId" = ${orgId} AND m."createdAt" > now() - interval '90 days'),
      (SELECT coalesce(max("createdAt")::text, '') || ':' || count(*) || ':' || count(*) FILTER (WHERE status = 'SUBMITTED')
         FROM "SupplierInvoice" WHERE "orgId" = ${orgId} AND "createdAt" > now() - interval '90 days'),
      (SELECT coalesce(max("createdAt")::text, '') || ':' || count(*)
         FROM "LedgerEntry" WHERE "orgId" = ${orgId} AND "date" > now() - interval '90 days')
    ) AS sig`;
  return row?.sig ?? "";
}
