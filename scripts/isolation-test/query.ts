// Helper for flows.mjs: prints one JSON line describing the current state of a flow.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));
const org = ids.ALPHA.org;

async function main() {
  const what = process.argv[2];
  if (what === "payroll-employee") {
    console.log(JSON.stringify({ count: await prisma.employee.count({ where: { orgId: org, name: "FLOW Employee" } }) }));
  } else if (what === "payroll-run") {
    const run = await prisma.payrollRun.findFirst({
      where: { orgId: org, period: new Date(Date.UTC(2026, 8, 1)) },
      include: { payslips: { include: { employee: true } } },
    });
    const slip = run?.payslips.find((p) => p.employee.name === "FLOW Employee");
    console.log(
      JSON.stringify({
        runs: run ? 1 : 0,
        runId: run?.id,
        status: run?.status,
        payslips: run?.payslips.length ?? 0,
        flowSlip: slip?.id,
        flowNet: slip ? Number(slip.netPay) : null,
        flowGross: slip ? Number(slip.gross) : null,
        flowOther: slip ? Number(slip.otherDeductions) : null,
        paid: run?.payslips.filter((p) => p.paidAt).length ?? 0,
        notes: await prisma.notification.count({ where: { orgId: org, event: "PAYSLIP_ISSUED" } }),
      })
    );
  } else if (what === "invoice") {
    const inv = await prisma.supplierInvoice.findFirst({ where: { orgId: org, description: "FLOW invoice" }, include: { request: true } });
    console.log(
      JSON.stringify({
        status: inv?.status,
        total: inv ? Number(inv.total) : null,
        payRef: inv?.payRef,
        requestCost: inv?.request?.actualCost ? Number(inv.request.actualCost) : null,
        requestPaid: !!inv?.request?.supplierPaidAt,
      })
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
