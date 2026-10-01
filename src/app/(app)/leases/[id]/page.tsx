import Link from "next/link";
import { getManagedLease, orgHasPremium } from "@/lib/lease-access";
import { computeSettlement, CONDITIONS } from "@/lib/checklists";
import { prisma } from "@/lib/prisma";
import { UpgradeCard } from "@/components/UpgradeCard";
import { startChecklist, saveChecklist, completeMoveIn, completeMoveOut } from "../actions";
import type { Checklist, ChecklistItem, ChecklistType } from "@prisma/client";

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = "rounded border border-border px-2 py-1.5 text-sm outline-none focus:border-ink";

function ChecklistForm({
  leaseId,
  checklist,
  withCost,
}: {
  leaseId: string;
  checklist: Checklist & { items: ChecklistItem[] };
  withCost: boolean;
}) {
  const locked = !!checklist.completedAt;
  const tasks = checklist.items.filter((i) => i.category === "TASK").sort((a, b) => a.sortOrder - b.sortOrder);
  const inventory = checklist.items.filter((i) => i.category === "INVENTORY").sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <form action={saveChecklist.bind(null, leaseId, checklist.id)}>
      <fieldset disabled={locked} className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Tasks</p>
          <ul className="mt-2 flex flex-col gap-2">
            {tasks.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="checkbox" name={`done_${i.id}`} defaultChecked={i.done} className="h-4 w-4" />
                  <span>{i.label}</span>
                </label>
                <input name={`notes_${i.id}`} defaultValue={i.notes ?? ""} placeholder="Note" className={`${input} w-44`} />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Unit condition {withCost && "and damage charges"}
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {inventory.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-full sm:w-56">{i.label}</span>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" name={`done_${i.id}`} defaultChecked={i.done} className="h-4 w-4" />
                  checked
                </label>
                <select name={`condition_${i.id}`} defaultValue={i.condition ?? ""} className={input}>
                  <option value="">Condition…</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0) + c.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
                <input name={`notes_${i.id}`} defaultValue={i.notes ?? ""} placeholder="Note" className={`${input} w-40`} />
                {withCost && (
                  <input
                    name={`cost_${i.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={Number(i.cost) || ""}
                    placeholder="Charge KES"
                    className={`${input} w-28`}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>

        {!locked && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <input name="newItem" placeholder="Add another item (e.g. Sofa, Fridge)" className={`${input} w-64`} />
            <select name="newCategory" className={input} defaultValue="INVENTORY">
              <option value="INVENTORY">Condition item</option>
              <option value="TASK">Task</option>
            </select>
            <button className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink">
              Save changes
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export default async function LeasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, lease } = await getManagedLease(id);
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Move-in and move-out" isAdmin={user.can("billing.manage")} />;
  }

  const [checklists, bills] = await Promise.all([
    prisma.checklist.findMany({ where: { leaseId: id }, include: { items: true } }),
    prisma.meterReading.findMany({
      where: { leaseId: id },
      include: { meter: true },
      orderBy: { readingDate: "desc" },
      take: 10,
    }),
  ]);
  const moveIn = checklists.find((c) => c.type === "MOVE_IN");
  const moveOut = checklists.find((c) => c.type === "MOVE_OUT");
  const active = lease.status === "ACTIVE";
  const settlement = moveOut && active ? await computeSettlement(id) : null;

  const start = (type: ChecklistType, label: string) => (
    <form action={startChecklist.bind(null, id, type)}>
      <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">{label}</button>
    </form>
  );

  return (
    <div className="max-w-3xl">
      <Link href="/leases" className="text-sm text-muted hover:underline">
        ← Move in and move out
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">{lease.tenant.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {lease.unit.property.name} · {lease.unit.label} · rent KES {fmt(lease.rentAmount)} · deposit KES{" "}
        {fmt(lease.depositAmount)}
      </p>
      <p className="mt-1 text-xs text-muted">
        {lease.tenant.phone ?? "No phone"} · ID {lease.tenant.idNumber ?? "not recorded"} · emergency contact{" "}
        {lease.tenant.emergencyName ? `${lease.tenant.emergencyName} ${lease.tenant.emergencyPhone ?? ""}` : "not recorded"}
        {" · "}
        <Link href={`/tenants/${lease.tenantId}/edit`} className="text-accent hover:underline">
          edit details
        </Link>
      </p>

      {!active && (
        <div className="mt-6 rounded-lg border border-border bg-accent-light p-4 text-sm text-ink">
          This tenant has moved out.{" "}
          <Link href={`/leases/${id}/clearance`} className="font-medium underline">
            View clearance certificate
          </Link>
        </div>
      )}

      <section className="mt-8 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">1. Move in</h2>
          {moveIn?.completedAt && <span className="text-xs font-medium text-accent">Completed</span>}
        </div>
        <p className="mt-1 text-sm text-muted">
          Record the paperwork and the condition of the unit on the day the tenant arrives. It protects both sides
          when they leave.
        </p>
        <div className="mt-4">
          {moveIn ? (
            <>
              <ChecklistForm leaseId={id} checklist={moveIn} withCost={false} />
              {!moveIn.completedAt && (
                <form action={completeMoveIn.bind(null, id)} className="mt-4">
                  <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">
                    Mark move-in complete
                  </button>
                  <p className="mt-1 text-xs text-muted">Save your changes first. All tasks must be ticked.</p>
                </form>
              )}
            </>
          ) : (
            start("MOVE_IN", "Start move-in checklist")
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">2. Utilities</h2>
          <Link href="/utilities/readings" className="text-sm font-medium text-accent hover:underline">
            Record readings
          </Link>
        </div>
        {bills.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No utility bills yet for this tenant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {bills.map((b) => (
              <li key={b.id} className="flex justify-between gap-3 py-2">
                <span>
                  {b.meter.type.charAt(0) + b.meter.type.slice(1).toLowerCase()} · {b.readingDate.toISOString().slice(0, 10)}
                  {b.notes ? ` · ${b.notes}` : ""}
                </span>
                <span className={b.status === "PAID" ? "text-muted" : "font-medium text-ink"}>
                  KES {fmt(b.amount)} {b.status === "PAID" ? "(paid)" : "(unpaid)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {active && (
        <section className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="font-serif text-xl text-ink">3. Move out and clear the unit</h2>
          <p className="mt-1 text-sm text-muted">
            When the tenant leaves: inspect the unit, note any damage and its cost, and settle the deposit.
          </p>
          <div className="mt-4">
            {moveOut ? (
              <>
                <ChecklistForm leaseId={id} checklist={moveOut} withCost />

                {settlement && (
                  <div className="mt-6 rounded-lg border border-border bg-background p-4 text-sm">
                    <p className="font-medium text-foreground">Deposit settlement (updates when you save)</p>
                    <table className="mt-2 w-full">
                      <tbody>
                        <tr>
                          <td className="py-1">Deposit held</td>
                          <td className="py-1 text-right">KES {fmt(settlement.deposit)}</td>
                        </tr>
                        <tr>
                          <td className="py-1 text-muted">Damage and cleaning charges</td>
                          <td className="py-1 text-right text-muted">-{fmt(settlement.damages)}</td>
                        </tr>
                        <tr>
                          <td className="py-1 text-muted">Unpaid utility bills ({settlement.unpaidBills.length})</td>
                          <td className="py-1 text-right text-muted">-{fmt(settlement.utilities)}</td>
                        </tr>
                        <tr>
                          <td className="py-1 text-muted">Unpaid rent ({settlement.arrearPayments.length})</td>
                          <td className="py-1 text-right text-muted">-{fmt(settlement.rentArrears)}</td>
                        </tr>
                        <tr className="border-t border-border font-medium text-ink">
                          <td className="py-2">{settlement.refund >= 0 ? "Refund to tenant" : "Tenant still owes"}</td>
                          <td className="py-2 text-right">KES {fmt(Math.abs(settlement.refund))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <form action={completeMoveOut.bind(null, id)} className="mt-5 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <select name="method" className={input} defaultValue="MPESA">
                      <option value="MPESA">Refund by M-Pesa</option>
                      <option value="BANK">Refund by bank</option>
                      <option value="CASH">Refund in cash</option>
                      <option value="NONE">No refund due</option>
                    </select>
                    <input name="reference" placeholder="Refund reference" className={`${input} w-44`} />
                  </div>
                  <input name="notes" placeholder="Notes for the record" className={`${input} w-full`} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="repairs" className="h-4 w-4" />
                    The unit needs repairs or repainting before it can be let again
                  </label>
                  <button className="self-start rounded bg-danger px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
                    Complete move-out and clear unit
                  </button>
                  <p className="text-xs text-muted">
                    This ends the lease, settles the deposit, marks the unit vacant (or under repair) and messages the
                    tenant. Save your checklist first. It cannot be undone.
                  </p>
                </form>
              </>
            ) : (
              start("MOVE_OUT", "Start move-out")
            )}
          </div>
        </section>
      )}
    </div>
  );
}
