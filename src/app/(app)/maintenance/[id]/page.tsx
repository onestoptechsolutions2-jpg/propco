import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, canManageOwnerRecords } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { assignSupplier, setStatus, completeRequest } from "../actions";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-danger/10 text-danger",
  ASSIGNED: "bg-ink-light/10 text-ink",
  IN_PROGRESS: "bg-accent-light text-accent",
  DONE: "bg-background text-muted",
  CANCELLED: "bg-background text-muted",
};

export default async function MaintenanceRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id },
    include: { unit: { include: { property: { include: { owner: true } } } }, supplier: true },
  });
  if (!request) notFound();

  const canManage = canManageOwnerRecords(user, request.unit.property.ownerId);
  if (!canManage && user.role !== "OWNER") notFound();
  if (user.role === "OWNER" && user.ownerId !== request.unit.property.ownerId) notFound();

  const suppliers = canManage ? await prisma.supplier.findMany({ orderBy: { name: "asc" } }) : [];

  const assignSupplierForRequest = assignSupplier.bind(null, request.id);
  const completeRequestForRequest = completeRequest.bind(null, request.id);

  return (
    <div className="max-w-2xl">
      <p className="text-xs uppercase tracking-wide text-muted">
        {request.unit.property.name} · {request.unit.label}
      </p>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="font-serif text-2xl text-ink">Maintenance request</h1>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[request.status]}`}>
          {request.status.replace("_", " ")}
        </span>
      </div>
      <p className="mt-3 text-sm text-foreground">{request.description}</p>
      <p className="mt-1 text-xs text-muted">
        Logged {request.createdAt.toLocaleDateString()}
        {request.reportedBy ? ` · reported by ${request.reportedBy}` : ""}
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Estimate</p>
          <p className="mt-1 text-lg text-ink">
            {request.costEstimate ? `KES ${Number(request.costEstimate).toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Actual cost</p>
          <p className="mt-1 text-lg text-ink">
            {request.actualCost ? `KES ${Number(request.actualCost).toLocaleString()}` : "—"}
          </p>
        </div>
      </div>

      {canManage && request.status !== "DONE" && request.status !== "CANCELLED" && (
        <div className="mt-8 border-t border-border pt-6">
          <h2 className="font-serif text-lg text-ink">Supplier</h2>
          {request.supplier ? (
            <p className="mt-2 text-sm text-foreground">
              Assigned to <strong>{request.supplier.name}</strong> ({request.supplier.phone ?? "no phone on file"})
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">Not yet assigned.</p>
          )}

          <form action={assignSupplierForRequest} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                {request.supplier ? "Reassign to" : "Assign to"}
              </label>
              <select
                name="supplierId"
                required
                defaultValue={request.supplierId ?? ""}
                className="w-56 rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
              >
                <option value="">Select a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.trade.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Estimate (KES)</label>
              <input
                name="costEstimate"
                type="number"
                min={0}
                step="0.01"
                defaultValue={request.costEstimate ? Number(request.costEstimate) : undefined}
                className="w-32 rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>
            <button
              type="submit"
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
            >
              {request.supplier ? "Reassign" : "Assign"}
            </button>
          </form>

          {suppliers.length === 0 && (
            <p className="mt-2 text-xs text-danger">
              No suppliers on file yet — <Link href="/suppliers/new" className="hover:underline">add one</Link>.
            </p>
          )}

          {request.status === "ASSIGNED" && (
            <form
              action={async () => {
                "use server";
                await setStatus(request.id, "IN_PROGRESS");
              }}
              className="mt-4"
            >
              <button type="submit" className="text-sm text-accent hover:underline">
                Mark as in progress
              </button>
            </form>
          )}

          <div className="mt-6 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-medium text-ink">Mark complete</h3>
            <form action={completeRequestForRequest} className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Actual cost (KES)</label>
                <input
                  name="actualCost"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={request.costEstimate ? Number(request.costEstimate) : undefined}
                  className="w-36 rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <button
                type="submit"
                className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
              >
                Mark done
              </button>
            </form>
          </div>

          <form
            action={async () => {
              "use server";
              await setStatus(request.id, "CANCELLED");
            }}
            className="mt-4"
          >
            <button type="submit" className="text-xs text-muted hover:underline">
              Cancel this request
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
