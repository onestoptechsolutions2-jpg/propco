import Link from "next/link";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { UpgradeCard } from "@/components/UpgradeCard";
import { createRun } from "./actions";

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireRole("ADMIN");
  if (!(await orgHasPremium(user.orgId))) return <UpgradeCard feature="Payroll" isAdmin />;
  const { error } = await searchParams;

  const [runs, employees] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { orgId: user.orgId },
      orderBy: { period: "desc" },
      include: { payslips: { select: { gross: true, netPay: true, paidAt: true } } },
    }),
    prisma.employee.count({ where: { orgId: user.orgId, active: true } }),
  ]);
  const nextMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">Payroll</h1>
          <p className="mt-1 text-sm text-muted">
            Monthly salaries with PAYE, NSSF, SHIF and the housing levy worked out for you.
          </p>
        </div>
        <Link href="/payroll/employees" className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink">
          Employees ({employees})
        </Link>
      </div>

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

      <form action={createRun} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-5">
        <div>
          <label className="mb-1 block text-xs text-muted">Pay month</label>
          <input type="month" name="month" defaultValue={nextMonth} className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink" />
        </div>
        <button className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Start payroll run</button>
        <p className="w-full text-xs text-muted">Creates a draft payslip for every active employee. You can add bonuses and deductions before approving.</p>
      </form>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {runs.map((r) => {
          const gross = r.payslips.reduce((s, p) => s + Number(p.gross), 0);
          const net = r.payslips.reduce((s, p) => s + Number(p.netPay), 0);
          const paid = r.payslips.filter((p) => p.paidAt).length;
          return (
            <li key={r.id}>
              <Link href={`/payroll/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-background">
                <div>
                  <p className="font-medium text-foreground">
                    {r.period.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                  </p>
                  <p className="text-xs text-muted">
                    {r.payslips.length} payslips · gross KES {fmt(gross)} · net KES {fmt(net)}
                  </p>
                </div>
                <span className="rounded-full bg-background px-2 py-1 text-xs font-medium text-muted">
                  {r.status === "PAID" ? "Paid" : r.status === "APPROVED" ? `Approved · ${paid}/${r.payslips.length} paid` : "Draft"}
                </span>
              </Link>
            </li>
          );
        })}
        {runs.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No payroll runs yet.</li>}
      </ul>
    </div>
  );
}
