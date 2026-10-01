import type { Employee } from "@prisma/client";

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

function Field({ label, name, defaultValue, type = "text", required = false }: { label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input name={name} type={type} required={required} defaultValue={defaultValue ?? ""} step={type === "number" ? "0.01" : undefined} className={input} />
    </div>
  );
}

/** Shared employee form fields (add and edit). */
export function EmployeeFields({ e }: { e?: Employee }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" name="name" defaultValue={e?.name} required />
        <Field label="Job title" name="jobTitle" defaultValue={e?.jobTitle} />
        <Field label="Phone (WhatsApp)" name="phone" defaultValue={e?.phone} />
        <Field label="Email" name="email" type="email" defaultValue={e?.email} />
        <Field label="Monthly basic salary (KES)" name="basicSalary" type="number" defaultValue={e ? Number(e.basicSalary) : undefined} required />
        <Field label="Monthly allowances (KES, taxable)" name="allowances" type="number" defaultValue={e ? Number(e.allowances) : 0} />
        <Field label="ID number" name="idNumber" defaultValue={e?.idNumber} />
        <Field label="KRA PIN" name="kraPin" defaultValue={e?.kraPin} />
        <Field label="NSSF number" name="nssfNo" defaultValue={e?.nssfNo} />
        <Field label="SHA / SHIF number" name="shifNo" defaultValue={e?.shifNo} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Paid by</label>
          <select name="payMethod" defaultValue={e?.payMethod ?? "MPESA"} className={input}>
            <option value="MPESA">M-Pesa</option>
            <option value="BANK">Bank</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
        <Field label="M-Pesa number" name="mpesaNumber" defaultValue={e?.mpesaNumber} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Send payslip via</label>
          <select name="notifyChannel" defaultValue={e?.notifyChannel ?? "WHATSAPP"} className={input}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
      </div>
    </>
  );
}
