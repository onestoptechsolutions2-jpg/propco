"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/access";
import { assertPremium } from "@/lib/lease-access";
import { computePayslip } from "@/lib/payroll";
import { notifyPayslip } from "@/lib/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const employeeSchema = z.object({
  name: z.string().trim().min(2, "Enter the employee's name"),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  idNumber: z.string().optional(),
  kraPin: z.string().optional(),
  nssfNo: z.string().optional(),
  shifNo: z.string().optional(),
  basicSalary: z.coerce.number().positive("Enter the monthly basic salary"),
  allowances: z.coerce.number().nonnegative().default(0),
  payMethod: z.enum(["MPESA", "BANK", "CASH"]).default("MPESA"),
  mpesaNumber: z.string().optional(),
  notifyChannel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).default("WHATSAPP"),
});

function parseEmployee(formData: FormData) {
  const get = (k: string) => (formData.get(k) ? String(formData.get(k)) : undefined);
  return employeeSchema.parse({
    name: get("name"),
    jobTitle: get("jobTitle"),
    phone: get("phone"),
    email: get("email"),
    idNumber: get("idNumber"),
    kraPin: get("kraPin"),
    nssfNo: get("nssfNo"),
    shifNo: get("shifNo"),
    basicSalary: get("basicSalary"),
    allowances: get("allowances") ?? 0,
    payMethod: get("payMethod") ?? "MPESA",
    mpesaNumber: get("mpesaNumber"),
    notifyChannel: get("notifyChannel") ?? "WHATSAPP",
  });
}

export async function addEmployee(formData: FormData) {
  const user = await requireRole("ADMIN");
  await assertPremium(user.orgId);
  const d = parseEmployee(formData);
  await prisma.employee.create({ data: { ...d, email: d.email || undefined, orgId: user.orgId } });
  revalidatePath("/payroll/employees");
  redirect("/payroll/employees");
}

export async function updateEmployee(id: string, formData: FormData) {
  const user = await requireRole("ADMIN");
  const d = parseEmployee(formData);
  await prisma.employee.update({
    where: { id, orgId: user.orgId },
    data: { ...d, email: d.email || undefined, active: formData.get("active") === "on" },
  });
  revalidatePath("/payroll/employees");
  redirect("/payroll/employees");
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Start a payroll run for a month: one draft payslip per active employee. */
export async function createRun(formData: FormData) {
  const user = await requireRole("ADMIN");
  await assertPremium(user.orgId);
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) redirect("/payroll?error=" + encodeURIComponent("Choose a month."));
  const [y, m] = month.split("-").map(Number);
  const period = new Date(Date.UTC(y, m - 1, 1));

  if (await prisma.payrollRun.findUnique({ where: { orgId_period: { orgId: user.orgId, period } } })) {
    redirect("/payroll?error=" + encodeURIComponent("A run for that month already exists."));
  }
  const employees = await prisma.employee.findMany({ where: { orgId: user.orgId, active: true } });
  if (employees.length === 0) redirect("/payroll?error=" + encodeURIComponent("Add at least one employee first."));

  const run = await prisma.payrollRun.create({
    data: {
      orgId: user.orgId,
      period,
      payslips: {
        create: employees.map((e) => {
          const c = computePayslip({ basic: Number(e.basicSalary), allowances: Number(e.allowances) });
          return { employeeId: e.id, basic: e.basicSalary, allowances: e.allowances, extraEarnings: 0, otherDeductions: 0, ...c };
        }),
      },
    },
  });
  redirect(`/payroll/${run.id}`);
}

async function ownRun(user: { orgId: string }, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, orgId: user.orgId } });
  if (!run) throw new Error("Payroll run not found.");
  return run;
}

/** Save bonuses / deductions typed on a draft run and recalculate every payslip. */
export async function saveRun(runId: string, formData: FormData) {
  const user = await requireRole("ADMIN");
  const run = await ownRun(user, runId);
  if (run.status !== "DRAFT") throw new Error("Only a draft run can be edited.");

  const slips = await prisma.payslip.findMany({ where: { runId } });
  for (const s of slips) {
    const extra = num(formData.get(`extra_${s.id}`));
    const other = num(formData.get(`other_${s.id}`));
    const c = computePayslip({
      basic: Number(s.basic),
      allowances: Number(s.allowances),
      extraEarnings: extra,
      otherDeductions: other,
    });
    await prisma.payslip.update({
      where: { id: s.id },
      data: { extraEarnings: extra, otherDeductions: other, notes: String(formData.get(`notes_${s.id}`) ?? "") || null, ...c },
    });
  }
  revalidatePath(`/payroll/${runId}`);
}

/** Lock the run and tell each employee their payslip is ready. */
export async function approveRun(runId: string) {
  const user = await requireRole("ADMIN");
  const run = await ownRun(user, runId);
  if (run.status !== "DRAFT") return;
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedAt: new Date() } });
  const slips = await prisma.payslip.findMany({ where: { runId }, select: { id: true } });
  for (const s of slips) await notifyPayslip(s.id);
  revalidatePath(`/payroll/${runId}`);
  revalidatePath("/payroll");
}

export async function deleteRun(runId: string) {
  const user = await requireRole("ADMIN");
  const run = await ownRun(user, runId);
  if (run.status !== "DRAFT") throw new Error("Only a draft run can be deleted.");
  await prisma.payrollRun.delete({ where: { id: runId } });
  revalidatePath("/payroll");
  redirect("/payroll");
}

export async function markPayslipPaid(payslipId: string, formData: FormData) {
  const user = await requireRole("ADMIN");
  const slip = await prisma.payslip.findFirst({
    where: { id: payslipId, run: { orgId: user.orgId, status: { in: ["APPROVED", "PAID"] } } },
  });
  if (!slip) throw new Error("Approve the run before paying.");
  const method = String(formData.get("method") ?? "MPESA");
  await prisma.payslip.update({
    where: { id: payslipId },
    data: {
      paidAt: new Date(),
      payMethod: ["MPESA", "BANK", "CASH"].includes(method) ? method : "MPESA",
      payRef: String(formData.get("reference") ?? "").trim() || null,
    },
  });
  const unpaid = await prisma.payslip.count({ where: { runId: slip.runId, paidAt: null } });
  if (unpaid === 0) await prisma.payrollRun.update({ where: { id: slip.runId }, data: { status: "PAID" } });
  revalidatePath(`/payroll/${slip.runId}`);
  revalidatePath("/payroll");
}
