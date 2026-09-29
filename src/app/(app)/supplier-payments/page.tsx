import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { markSupplierPaid } from "./actions";

const fmt = (value: unknown) =>
  Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function SupplierPaymentsPage() {
  const user = await requireRole("STAFF");

  const jobs = await prisma.maintenanceRequest.findMany({
    where: { status: "DONE", supplierId: { not: null }, unit: { property: { orgId: user.orgId } } },
    include: { supplier: true, unit: { include: { property: true } } },
    orderBy: [{ supplierPaidAt: { sort: "asc", nulls: "first" } }, { completedAt: "desc" }],
  });

  const outstanding = jobs
    .filter((j) => !j.supplierPaidAt)
    .reduce((sum, j) => sum + Number(j.actualCost ?? 0), 0);

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">Supplier payments</h1>
      <p className="mt-1 text-sm text-muted">
        Completed jobs awaiting payment · outstanding KES {fmt(outstanding)}
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3 text-right">Amount (KES)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {job.supplier?.name}
                    {job.supplier?.mpesaNumber && (
                      <p className="text-xs font-normal text-muted">M-Pesa {job.supplier.mpesaNumber}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {job.description}
                    <p className="text-xs text-muted">
                      {job.unit.property.name} · {job.unit.label}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{fmt(job.actualCost)}</td>
                  <td className="px-4 py-3">
                    {job.supplierPaidAt ? (
                      <div>
                        <span className="rounded-full bg-accent-light px-2 py-1 text-xs font-medium text-accent">
                          Paid
                        </span>
                        <p className="mt-1 text-xs text-muted">
                          {job.supplierPayMethod} · {job.supplierPaidAt.toLocaleDateString()}
                          {job.supplierPayRef ? ` · ${job.supplierPayRef}` : ""}
                        </p>
                      </div>
                    ) : (
                      <span className="rounded-full bg-ink-light/10 px-2 py-1 text-xs font-medium text-ink">
                        Unpaid
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!job.supplierPaidAt && (
                      <form
                        action={markSupplierPaid.bind(null, job.id)}
                        className="flex flex-wrap items-center justify-end gap-2"
                      >
                        <select
                          name="method"
                          defaultValue={job.supplier?.payoutMethod === "bank" ? "BANK" : "MPESA"}
                          className="rounded border border-border px-2 py-1.5 text-xs outline-none focus:border-ink"
                        >
                          <option value="MPESA">M-Pesa</option>
                          <option value="BANK">Bank</option>
                        </select>
                        <input
                          name="reference"
                          placeholder="Reference"
                          className="w-28 rounded border border-border px-2 py-1.5 text-xs outline-none focus:border-ink"
                        />
                        <button type="submit" className="text-xs font-medium text-accent hover:underline">
                          Mark paid
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                    No completed supplier jobs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
