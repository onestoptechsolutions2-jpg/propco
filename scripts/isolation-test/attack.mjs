import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3055";
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));
const A = ids.ALPHA, B = ids.BRAVO;

const jar = new Map();
const addCookies = (res) => {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    const k = pair.slice(0, i), v = pair.slice(i + 1);
    if (!v) jar.delete(k); else jar.set(k, v);
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const raw = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { redirect: "manual", ...opts, headers: { cookie: cookie(), origin: BASE, ...(opts.headers ?? {}) } });
  addCookies(res);
  return res;
};

async function login(email) {
  const { csrfToken } = await (await raw("/api/auth/csrf")).json();
  await raw("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: "Passw0rd!x", callbackUrl: BASE + "/dashboard", json: "true" }),
  });
  const s = await (await raw("/api/auth/session")).json();
  if (!s?.user) throw new Error("login failed");
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:$-]+)=("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4];
  return out;
}

/** Find the server-action form on `pagePath` that has a field named `field`, and submit it with overrides. */
async function submit(label, pagePath, field, overrides) {
  const page = await raw(pagePath);
  if (page.status !== 200) return console.log(`SKIP  ${label}: page ${pagePath} -> ${page.status}`), "skip";
  const html = await page.text();
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => new RegExp(`name="${field}"`).test(f));
  if (!form) return console.log(`SKIP  ${label}: no form with field ${field} on ${pagePath}`), "skip";

  const fd = new FormData();
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.type === "hidden" && a.name) fd.set(a.name, (a.value ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);

  const res = await raw(pagePath, { method: "POST", body: fd });
  const body = await res.text();
  const digest = /digest|Unhandled|error/i.test(body) ? " (server raised an error)" : "";
  console.log(`SENT  ${label}: HTTP ${res.status}${digest}`);
  return "sent";
}

async function main() {
  await login("alpha-admin@test.local");

  const today = new Date().toISOString().slice(0, 10);
  const later = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  await submit("createMeter on B's unit", "/utilities/meters/new", "unitId", { unitId: B.unit1, type: "WATER", mode: "METERED", rate: "50", unitName: "m3", label: "HACK-METER" });
  await submit("createProperty for B's owner", "/properties/new", "ownerId", { ownerId: B.owner, name: "HACK PROPERTY", addressLine1: "x", type: "SINGLE_UNIT", managementMode: "AGENCY_MANAGED", commissionPct: "10" });
  await submit("createBooking on B's unit", "/stays", "guestName", { unitId: B.unit2, guestName: "HACK GUEST", checkIn: today, checkOut: later, nightlyRate: "100", source: "Direct", guests: "1" });
  await submit("createAccessCode on B's unit", "/access", "code", { unitId: B.unit1, label: "HACK CODE", code: "999999" });
  await submit("recordReadings on B's property", "/utilities/readings", "readingDate", { propertyId: B.property, [`reading_${B.meter}`]: "99999", kind: "BILL" });
  await submit("createMaintenanceRequest on B's unit", "/maintenance/new", "description", { unitId: B.unit1, description: "HACK REQUEST" });
  await submit("assignSupplier (B's supplier) to A's request", `/maintenance/${A.openRequest}`, "supplierId", { supplierId: B.supplier, costEstimate: "1" });
  await submit("approveProof against B's lease", "/rent/confirm", "leaseId", { leaseId: B.lease, amount: "20000", code: "HACKCODE01" });
  await submit("addSchedule on B's property", "/maintenance/schedule", "title", { propertyId: B.property, title: "HACK JOB", intervalMonths: "6", nextDue: today });
  await submit("addTemplates on B's property", "/maintenance/schedule", "propertyId", { propertyId: B.property });
  // A lease-less tenant of A tries to lease B's vacant unit; and A's vacant unit gets B's tenant
  await submit("createLease into B's unit", `/tenants/${A.tenant2}/edit`, "unitId", { unitId: B.unit2, startDate: today, rentAmount: "1", depositAmount: "1" });
  await submit("createLease with B's tenant", `/tenants/${A.tenant2}/edit`, "unitId", { tenantId: B.tenant, unitId: A.unit2, startDate: today, rentAmount: "1" });
}
main().catch((e) => { console.error(e); process.exit(2); });
