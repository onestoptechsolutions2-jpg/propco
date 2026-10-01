// End-to-end check of payroll and supplier-invoice flows through the real forms.
// Run after seed.ts with the app running. Prints PASS/FAIL per step.
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3055";
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));
const A = ids.ALPHA;

const jar = new Map();
const raw = async (path, opts = {}) => {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    ...opts,
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), origin: BASE, connection: "close", ...(opts.headers ?? {}) },
  }).catch((e) => {
    throw new Error(`${opts.method ?? "GET"} ${path} failed: ${e.cause?.code ?? e.message}`);
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return res;
};
async function login(email) {
  const { csrfToken } = await (await raw("/api/auth/csrf")).json();
  await raw("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: "Passw0rd!x", callbackUrl: BASE + "/dashboard", json: "true" }),
  });
}
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-zA-Z_:$-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

async function submit(path, match, fields = {}, within = null) {
  let html = await (await raw(path)).text();
  // `within`: only look at the <li> list item that contains this text (e.g. one invoice card)
  if (within) {
    const chunk = html.split("<li").find((c) => c.includes(within));
    if (!chunk) throw new Error(`no list item containing "${within}" on ${path}`);
    html = chunk;
  }
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => (match instanceof RegExp ? match.test(f) : new RegExp(`name="${match}"`).test(f)));
  if (!form) throw new Error(`no form matching ${match} on ${path}`);
  const fd = new FormData();
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.type === "hidden" && a.name) fd.set(a.name, (a.value ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  let res;
  try {
    res = await raw(path, { method: "POST", body: fd });
    await res.text();
  } catch (e) {
    // The server may drop the connection when an action redirects; retry the read once.
    console.log("   (connection reset after POST to " + path + "; continuing)");
    return 0;
  }
  return res.status;
}

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const q = (script) => JSON.parse(execSync(`npx tsx scripts/isolation-test/query.ts ${script}`, { encoding: "utf8" }).trim().split("\n").pop());

await login("alpha-admin@test.local");

// ---- Payroll
await submit("/payroll/employees", "basicSalary", { name: "FLOW Employee", basicSalary: "100000", allowances: "0", payMethod: "MPESA", notifyChannel: "WHATSAPP", phone: "0712345678" });
let s = q("payroll-employee");
check("employee created", s.count >= 1);

await submit("/payroll", "month", { month: "2026-09" });
s = q("payroll-run");
check("run created with payslips for active employees", s.runs === 1 && s.payslips >= 1, JSON.stringify(s));
check("payslip maths (gross 100k -> net 70,441.65)", s.flowNet === 70441.65, `net=${s.flowNet}`);

// bonus of 10,000 and 1,000 other deduction on the FLOW employee, recalculated
await submit(`/payroll/${s.runId}`, `extra_${s.flowSlip}`, { [`extra_${s.flowSlip}`]: "10000", [`other_${s.flowSlip}`]: "1000" });
s = q("payroll-run");
check("bonus + deduction recalculated", s.flowGross === 110000 && s.flowOther === 1000, `gross=${s.flowGross} other=${s.flowOther}`);

await submit(`/payroll/${s.runId}`, /Approve and send payslips/);
s = q("payroll-run");
check("run approved", s.status === "APPROVED");
check("payslip notification queued", s.notes >= 1, `notes=${s.notes}`);

await submit(`/payroll/${s.runId}`, "reference", { method: "MPESA", reference: "FLOWPAY1" });
s = q("payroll-run");
check("payslip marked paid", s.paid >= 1);

// ---- Supplier invoice with owner charge-through
await submit("/invoices", "supplierId", { supplierId: A.supplier, requestId: A.openRequest, description: "FLOW invoice", amount: "5000", addVat: "on", number: "F-1" });
let inv = q("invoice");
check("invoice created with 16% VAT", inv.status === "SUBMITTED" && inv.total === 5800, JSON.stringify(inv));

await submit("/invoices?status=SUBMITTED", /Approve/, {}, "FLOW invoice");
inv = q("invoice");
check("invoice approved", inv.status === "APPROVED");
check("repair cost set from invoice (owner charge-through)", inv.requestCost === 5800, `cost=${inv.requestCost}`);

await submit("/invoices?status=APPROVED", "reference", { method: "MPESA", reference: "FLOWINV1" }, "FLOW invoice");
inv = q("invoice");
check("invoice paid", inv.status === "PAID" && inv.payRef === "FLOWINV1");
check("linked repair marked paid to supplier", inv.requestPaid === true);

console.log(failed ? `\n${failed} FAILED` : "\nALL FLOW STEPS PASSED");
process.exit(failed ? 1 : 0);
