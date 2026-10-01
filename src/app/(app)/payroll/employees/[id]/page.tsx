import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateEmployee } from "../../actions";
import { EmployeeFields } from "../../EmployeeFields";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("payroll.manage");
  const e = await prisma.employee.findFirst({ where: { id, orgId: user.orgId } });
  if (!e) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/payroll/employees" className="text-sm text-muted hover:underline">
        ← Employees
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">{e.name}</h1>
      <form action={updateEmployee.bind(null, e.id)} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <EmployeeFields e={e} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={e.active} className="h-4 w-4" />
          Currently employed (included in new payroll runs)
        </label>
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save changes</button>
      </form>
    </div>
  );
}
