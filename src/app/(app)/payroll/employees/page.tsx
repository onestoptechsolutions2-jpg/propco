import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { addEmployee } from "../actions";
import { EmployeeFields } from "../EmployeeFields";

const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function EmployeesPage() {
  const user = await requirePermission("payroll.manage");
  const employees = await prisma.employee.findMany({ where: { orgId: user.orgId }, orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <div className="max-w-3xl">
      <Link href="/payroll" className="text-sm text-muted hover:underline">
        ← Payroll
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">Employees</h1>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {employees.map((e) => (
          <li key={e.id}>
            <Link href={`/payroll/employees/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-background">
              <div>
                <p className={`font-medium ${e.active ? "text-foreground" : "text-muted line-through"}`}>{e.name}</p>
                <p className="text-xs text-muted">{e.jobTitle ?? "No job title"}</p>
              </div>
              <span className="text-xs text-muted">Basic KES {fmt(e.basicSalary)}</span>
            </Link>
          </li>
        ))}
        {employees.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No employees yet. Add the first one below.</li>}
      </ul>

      <h2 className="mt-8 font-serif text-xl text-ink">Add an employee</h2>
      <form action={addEmployee} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <EmployeeFields />
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Add employee</button>
      </form>
    </div>
  );
}
