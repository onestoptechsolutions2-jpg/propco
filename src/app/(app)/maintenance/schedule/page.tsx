import Link from "next/link";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { addSchedule, addTemplates, markScheduleDone, removeSchedule } from "./actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function SchedulePage() {
  const user = await requireRole("STAFF", "LANDLORD");
  const scope = ownerScopeFilter(user);

  const [properties, suppliers, jobs] = await Promise.all([
    prisma.property.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
    prisma.maintenanceSchedule.findMany({
      where: { active: true, property: scope },
      include: { property: true, supplier: true },
      orderBy: { nextDue: "asc" },
    }),
  ]);

  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86_400_000);
  const overdue = jobs.filter((j) => j.nextDue < now).length;

  return (
    <div className="max-w-3xl">
      <Link href="/maintenance" className="text-sm text-muted hover:underline">
        ← Repair requests
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">Preventive maintenance calendar</h1>
      <p className="mt-1 text-sm text-muted">
        Recurring jobs that stop expensive breakdowns: tank cleaning, fire checks, generator service.{" "}
        {overdue > 0 ? <strong className="text-danger">{overdue} overdue.</strong> : "Nothing overdue."}
      </p>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {jobs.map((j) => {
          const late = j.nextDue < now;
          const dueSoon = !late && j.nextDue <= soon;
          return (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{j.title}</p>
                <p className="text-xs text-muted">
                  {j.property.name} · every {j.intervalMonths} month{j.intervalMonths === 1 ? "" : "s"}
                  {j.supplier ? ` · ${j.supplier.name}` : ""}
                  {j.lastDone ? ` · last done ${day(j.lastDone)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    late
                      ? "bg-danger/10 text-danger"
                      : dueSoon
                        ? "bg-accent-light text-accent"
                        : "bg-background text-muted"
                  }`}
                >
                  {late ? "Overdue " : dueSoon ? "Due " : "Next "}
                  {day(j.nextDue)}
                </span>
                <form action={markScheduleDone.bind(null, j.id)}>
                  <button className="text-xs font-medium text-accent hover:underline">Mark done</button>
                </form>
                <form action={removeSchedule.bind(null, j.id)}>
                  <button className="text-xs text-danger hover:underline">Remove</button>
                </form>
              </div>
            </li>
          );
        })}
        {jobs.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            No recurring jobs yet. Add the standard set below in one tap.
          </li>
        )}
      </ul>

      {properties.length > 0 && (
        <>
          <form action={addTemplates} className="mt-6 flex flex-wrap items-center gap-2">
            <select name="propertyId" className={input}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">
              Add the standard checklist
            </button>
            <span className="text-xs text-muted">Tank cleaning, fire checks, generator, roof, pest control and more.</span>
          </form>

          <h2 className="mt-8 font-serif text-xl text-ink">Add your own recurring job</h2>
          <form action={addSchedule} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <select name="propertyId" required className={input}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input name="title" required placeholder="e.g. Borehole pump service" className={input} />
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Repeat every (months)</label>
                <input name="intervalMonths" type="number" min={1} max={120} defaultValue={6} required className={`${input} w-32`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">First due date</label>
                <input name="nextDue" type="date" required defaultValue={day(soon)} className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Estimated cost (KES)</label>
                <input name="estimatedCost" type="number" min={0} className={`${input} w-36`} />
              </div>
            </div>
            <select name="supplierId" className={input} defaultValue="">
              <option value="">Usual supplier (optional)…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
              Add job
            </button>
          </form>
        </>
      )}
    </div>
  );
}
