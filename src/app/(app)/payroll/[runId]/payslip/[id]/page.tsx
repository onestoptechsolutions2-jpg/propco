import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/PrintButton";

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PayslipPage({ params }: { params: Promise<{ runId: string; id: string }> }) {
  const { runId, id } = await params;
  const user = await requirePermission("payroll.manage");
  const s = await prisma.payslip.findFirst({
    where: { id, runId, run: { orgId: user.orgId } },
    include: { employee: true, run: { include: { org: true } } },
  });
  if (!s) notFound();
  const month = s.run.period.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const earnings: [string, number][] = [
    ["Basic salary", Number(s.basic)],
    ["Allowances", Number(s.allowances)],
    ...(Number(s.extraEarnings) > 0 ? ([["Bonus / commission", Number(s.extraEarnings)]] as [string, number][]) : []),
  ];
  const deductions: [string, number][] = [
    ["PAYE", Number(s.paye)],
    ["NSSF", Number(s.nssf)],
    ["SHIF", Number(s.shif)],
    ["Affordable housing levy", Number(s.housingLevy)],
    ...(Number(s.otherDeductions) > 0 ? ([["Other deductions", Number(s.otherDeductions)]] as [string, number][]) : []),
  ];

  return (
    <div className="mx-auto max-w-2xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/payroll/${runId}`} className="text-sm text-muted hover:underline">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border border-border bg-surface p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="font-serif text-2xl text-ink">{s.run.org.name}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-muted">Payslip</p>
          </div>
          <p className="text-sm font-medium text-foreground">{month}</p>
        </div>

        <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted">Employee: </span>
            {s.employee.name}
          </p>
          <p>
            <span className="text-muted">Job title: </span>
            {s.employee.jobTitle ?? "-"}
          </p>
          <p>
            <span className="text-muted">KRA PIN: </span>
            {s.employee.kraPin ?? "-"}
          </p>
          <p>
            <span className="text-muted">NSSF no: </span>
            {s.employee.nssfNo ?? "-"}
          </p>
          <p>
            <span className="text-muted">SHA no: </span>
            {s.employee.shifNo ?? "-"}
          </p>
          <p>
            <span className="text-muted">ID no: </span>
            {s.employee.idNumber ?? "-"}
          </p>
        </div>

        <table className="mt-6 w-full text-sm">
          <tbody>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <td className="py-1.5">Earnings</td>
              <td className="py-1.5 text-right">KES</td>
            </tr>
            {earnings.map(([label, v]) => (
              <tr key={label} className="border-t border-border">
                <td className="py-1.5">{label}</td>
                <td className="py-1.5 text-right">{fmt(v)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-1.5">Gross pay</td>
              <td className="py-1.5 text-right">{fmt(s.gross)}</td>
            </tr>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <td className="pb-1.5 pt-5">Deductions</td>
              <td className="pb-1.5 pt-5 text-right">KES</td>
            </tr>
            {deductions.map(([label, v]) => (
              <tr key={label} className="border-t border-border">
                <td className="py-1.5">{label}</td>
                <td className="py-1.5 text-right">-{fmt(v)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-serif text-lg text-ink">
              <td className="py-3">Net pay</td>
              <td className="py-3 text-right">{fmt(s.netPay)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Taxable pay {fmt(s.taxablePay)} (after NSSF, SHIF and housing levy). Personal relief of KES 2,400 applied.</p>
        {s.paidAt && (
          <p className="mt-3 text-xs text-muted">
            Paid on {s.paidAt.toISOString().slice(0, 10)} via {s.payMethod}
            {s.payRef ? `, reference ${s.payRef}` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
