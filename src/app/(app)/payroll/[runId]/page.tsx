import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PAYROLL_RATES } from "@/lib/payroll";
import { saveRun, approveRun, deleteRun, markPayslipPaid } from "../actions";

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = "rounded border border-border px-2 py-1.5 text-sm outline-none focus:border-ink";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const user = await requirePermission("payroll.manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, orgId: user.orgId },
    include: { payslips: { include: { employee: true }, orderBy: { employee: { name: "asc" } } } },
  });
  if (!run) notFound();

  const draft = run.status === "DRAFT";
  const sum = (k: "gross" | "nssf" | "shif" | "housingLevy" | "paye" | "netPay" | "employerNssf" | "employerHousingLevy") =>
    run.payslips.reduce((s, p) => s + Number(p[k]), 0);
  const month = run.period.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const remit = [
    ["PAYE (to KRA)", sum("paye")],
    ["NSSF (employee + employer)", sum("nssf") + sum("employerNssf")],
    ["SHIF (to SHA)", sum("shif")],
    ["Housing levy (employee + employer)", sum("housingLevy") + sum("employerHousingLevy")],
  ] as const;

  return (
    <div className="max-w-5xl">
      <Link href="/payroll" className="text-sm text-muted hover:underline">
        ← Payroll
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink">{month}</h1>
          <p className="mt-1 text-sm text-muted">
            {run.status === "DRAFT" ? "Draft: add bonuses or deductions, then approve." : run.status === "APPROVED" ? "Approved. Pay each employee and record it." : "All paid."}
          </p>
        </div>
        {draft && (
          <div className="flex items-center gap-3">
            <form action={deleteRun.bind(null, run.id)}>
              <button className="text-sm text-danger hover:underline">Delete draft</button>
            </form>
            <form action={approveRun.bind(null, run.id)}>
              <button className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Approve and send payslips</button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Gross pay", sum("gross")],
          ["Deductions", sum("gross") - sum("netPay")],
          ["Net to employees", sum("netPay")],
          ["Total cost to you", sum("gross") + sum("employerNssf") + sum("employerHousingLevy")],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 font-serif text-xl text-ink">KES {fmt(value)}</p>
          </div>
        ))}
      </div>

      <form action={saveRun.bind(null, run.id)} className="mt-6">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-background text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3 text-right">Basic + allow.</th>
                  <th className="px-3 py-3 text-right">Bonus / commission</th>
                  <th className="px-3 py-3 text-right">Gross</th>
                  <th className="px-3 py-3 text-right">PAYE</th>
                  <th className="px-3 py-3 text-right">NSSF</th>
                  <th className="px-3 py-3 text-right">SHIF</th>
                  <th className="px-3 py-3 text-right">Levy</th>
                  <th className="px-3 py-3 text-right">Other ded.</th>
                  <th className="px-3 py-3 text-right">Net pay</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {run.payslips.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-3 py-3 font-medium text-foreground">
                      {p.employee.name}
                      <p className="text-xs font-normal text-muted">{p.employee.jobTitle}</p>
                    </td>
                    <td className="px-3 py-3 text-right">{fmt(Number(p.basic) + Number(p.allowances))}</td>
                    <td className="px-3 py-3 text-right">
                      {draft ? <input name={`extra_${p.id}`} type="number" min={0} step="0.01" defaultValue={Number(p.extraEarnings) || ""} className={`${input} w-24 text-right`} /> : fmt(p.extraEarnings)}
                    </td>
                    <td className="px-3 py-3 text-right">{fmt(p.gross)}</td>
                    <td className="px-3 py-3 text-right">{fmt(p.paye)}</td>
                    <td className="px-3 py-3 text-right">{fmt(p.nssf)}</td>
                    <td className="px-3 py-3 text-right">{fmt(p.shif)}</td>
                    <td className="px-3 py-3 text-right">{fmt(p.housingLevy)}</td>
                    <td className="px-3 py-3 text-right">
                      {draft ? <input name={`other_${p.id}`} type="number" min={0} step="0.01" defaultValue={Number(p.otherDeductions) || ""} className={`${input} w-24 text-right`} /> : fmt(p.otherDeductions)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-ink">{fmt(p.netPay)}</td>
                    <td className="px-3 py-3 text-right">
                      <Link href={`/payroll/${run.id}/payslip/${p.id}`} className="text-xs text-accent hover:underline">
                        Payslip
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {draft && (
          <button className="mt-4 rounded border border-border px-5 py-2.5 text-sm font-medium hover:border-ink">
            Save and recalculate
          </button>
        )}
      </form>

      {!draft && (
        <section className="mt-8">
          <h2 className="font-serif text-xl text-ink">Pay employees</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {run.payslips.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{p.employee.name}</p>
                  <p className="text-xs text-muted">
                    KES {fmt(p.netPay)} via {p.employee.payMethod.toLowerCase()}
                    {p.employee.mpesaNumber ? ` ${p.employee.mpesaNumber}` : ""}
                  </p>
                </div>
                {p.paidAt ? (
                  <span className="text-xs text-accent">
                    Paid {p.paidAt.toISOString().slice(0, 10)} {p.payRef ? `· ${p.payRef}` : ""}
                  </span>
                ) : (
                  <form action={markPayslipPaid.bind(null, p.id)} className="flex flex-wrap items-center gap-2">
                    <select name="method" defaultValue={p.employee.payMethod} className={input}>
                      <option value="MPESA">M-Pesa</option>
                      <option value="BANK">Bank</option>
                      <option value="CASH">Cash</option>
                    </select>
                    <input name="reference" placeholder="Reference" className={`${input} w-32`} />
                    <button className="text-xs font-medium text-accent hover:underline">Mark paid</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">To pay to the authorities this month</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {remit.map(([label, amount]) => (
            <li key={label} className="flex justify-between py-2">
              <span>{label}</span>
              <span className="font-medium text-ink">KES {fmt(amount)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{PAYROLL_RATES.label}. PropCo works these out; you still file and pay them through iTax, NSSF and SHA.</p>
      </section>
    </div>
  );
}
