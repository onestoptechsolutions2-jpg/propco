import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3055";
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));

class Jar {
  c = new Map();
  add(res) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (!v || /expires=Thu, 01 Jan 1970/i.test(sc)) this.c.delete(k);
      else this.c.set(k, v);
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; "); }
}

async function req(jar, path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", ...opts, headers: { cookie: jar.header(), ...(opts.headers ?? {}) } });
  jar.add(res);
  return res;
}

async function login(email, password = "Passw0rd!x") {
  const jar = new Jar();
  const r1 = await req(jar, "/api/auth/csrf");
  const { csrfToken } = await r1.json();
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE + "/dashboard", json: "true" });
  const r2 = await req(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const check = await (await req(jar, "/api/auth/session")).json();
  if (!check?.user) throw new Error(`login failed for ${email} (status ${r2.status})`);
  return { jar, user: check.user };
}

async function get(jar, path) {
  let res = await req(jar, path);
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && hops++ < 4) {
    const loc = res.headers.get("location") ?? "";
    if (loc.includes("/login") || loc.includes("denied") || loc.includes("onboarding")) {
      return { status: res.status, redirect: loc, text: "" };
    }
    res = await req(jar, loc.startsWith("http") ? new URL(loc).pathname + new URL(loc).search : loc);
  }
  const text = res.headers.get("content-type")?.includes("text") || res.headers.get("content-type")?.includes("html") ? await res.text() : "";
  return { status: res.status, redirect: null, text };
}

const failures = [];
let checks = 0;
const fail = (who, path, why) => failures.push(`${who} -> ${path}: ${why}`);

const LIST_PAGES = [
  "/dashboard", "/insights", "/properties", "/owners", "/tenants", "/leases", "/rent", "/rent/confirm",
  "/payouts", "/maintenance", "/maintenance/schedule", "/suppliers", "/supplier-payments", "/utilities",
  "/utilities/readings", "/utilities/meters/new", "/notifications", "/listings", "/stays", "/access",
  "/services", "/billing", "/team", "/guide", "/payroll", "/payroll/employees", "/invoices", "/properties/new", "/owners/new", "/tenants/new", "/suppliers/new", "/maintenance/new",
];

const directPages = (o) => [
  `/properties/${o.property}`, `/properties/${o.property}/edit`, `/properties/${o.property}/units/new`,
  `/owners/${o.owner}`, `/owners/${o.owner}/edit`, `/tenants/${o.tenant}/edit`, `/tenants/${o.tenant}/reference`,
  `/suppliers/${o.supplier}/edit`, `/maintenance/${o.request}`, `/rent/${o.lease}`, `/rent/${o.lease}/invoice`,
  `/rent/${o.lease}/receipt/${o.paid}`, `/payroll/employees/${o.employee}`, `/payroll/${o.run}`, `/payroll/${o.run}/payslip/${o.payslip}`, `/leases/${o.lease}`, `/leases/${o.lease}/clearance`, `/payouts/${o.payout}/statement`,
];

async function actor(label, email, own, other, { staffLike }) {
  const { jar } = await login(email);
  const me = own === "ALPHA" ? "ALPHA" : "BRAVO";
  const them = other;

  // 1) list pages must never contain the other company's marker
  for (const p of LIST_PAGES) {
    checks++;
    const r = await get(jar, p);
    if (r.status >= 500) fail(label, p, `server error ${r.status}`);
    if (r.text.includes(them)) fail(label, p, `LEAK: page contains "${them}"`);
    if (r.text.includes("Shared Insurer") === false && p === "/services" && staffLike && r.status === 200) fail(label, p, "services page missing shared partner");
  }

  // 2) direct-ID pages of the OTHER company must be unreachable
  for (const p of directPages(ids[them])) {
    checks++;
    const r = await get(jar, p);
    const blocked = r.status === 404 || r.redirect || r.status === 403;
    if (!blocked && r.text.includes(them)) fail(label, p, `LEAK via direct URL (status ${r.status})`);
    else if (!blocked && r.status === 200) fail(label, p, `reachable (status 200) although not their data`);
  }

  // 3) photo of other company
  checks++;
  let r = await req(jar, `/api/photos/${ids[them].photo}`);
  if (r.status === 200) fail(label, `/api/photos/${them}`, "other company's photo was served");

  // 4) platform admin pages
  for (const p of ["/platform", "/platform/partners"]) {
    checks++;
    const rr = await get(jar, p);
    if (rr.status === 200) fail(label, p, "platform page opened by non-platform admin");
  }

  return { jar };
}

async function main() {
  const A = ids.ALPHA, B = ids.BRAVO;

  // Sanity: users can see their OWN data (so a pass isn't vacuous).
  for (const [tag, email] of [["ALPHA", "alpha-admin@test.local"], ["BRAVO", "bravo-admin@test.local"]]) {
    const { jar } = await login(email);
    for (const p of ["/properties", "/owners", "/tenants", "/suppliers", "/notifications", "/leases", "/listings"]) {
      checks++;
      const r = await get(jar, p);
      if (!r.text.includes(tag)) fail(`${tag} admin`, p, `own data missing (status ${r.status})`);
    }
    // own direct pages work
    for (const p of directPages(ids[tag]).filter((x) => !x.endsWith("/clearance"))) {
      checks++;
      const r = await get(jar, p);
      if (r.status !== 200) fail(`${tag} admin`, p, `own page not reachable (status ${r.status})`);
    }
    checks++;
    const ph = await req(jar, `/api/photos/${ids[tag].photo}`);
    if (ph.status !== 200) fail(`${tag} admin`, "own photo", `status ${ph.status}`);
  }

  await actor("ALPHA admin", "alpha-admin@test.local", "ALPHA", "BRAVO", { staffLike: true });
  await actor("ALPHA staff", "alpha-staff@test.local", "ALPHA", "BRAVO", { staffLike: true });
  await actor("BRAVO admin", "bravo-admin@test.local", "BRAVO", "ALPHA", { staffLike: true });
  await actor("BRAVO staff", "bravo-staff@test.local", "BRAVO", "ALPHA", { staffLike: true });

  // OWNER-role users: only their own portfolio; blocked from staff-only pages.
  for (const [tag, other, email] of [["ALPHA", "BRAVO", "alpha-ownerlogin@test.local"], ["BRAVO", "ALPHA", "bravo-ownerlogin@test.local"]]) {
    const { jar } = await login(email);
    for (const p of ["/dashboard", "/properties", "/payouts", "/maintenance", "/insights", "/guide"]) {
      checks++;
      const r = await get(jar, p);
      if (r.text.includes(other)) fail(`${tag} owner-user`, p, `LEAK "${other}"`);
    }
    for (const p of ["/owners", "/tenants", "/rent", "/suppliers", "/notifications", "/team", "/billing", "/utilities", "/stays", "/access", "/leases", "/rent/confirm", "/supplier-payments", "/payroll", "/payroll/employees", "/invoices"]) {
      checks++;
      const r = await get(jar, p);
      if (r.status === 200 && !r.redirect) fail(`${tag} owner-user`, p, "staff-only page opened by OWNER role");
    }
    for (const p of directPages(ids[other])) {
      checks++;
      const r = await get(jar, p);
      if (r.status === 200) fail(`${tag} owner-user`, p, `reached other company's page`);
    }
    // an owner may not manage staff pages of their own company either
    for (const p of [`/owners/${ids[tag].owner}/edit`, `/tenants/${ids[tag].tenant}/edit`, `/rent/${ids[tag].lease}/invoice`, `/leases/${ids[tag].lease}`]) {
      checks++;
      const r = await get(jar, p);
      if (r.status === 200) fail(`${tag} owner-user`, p, "OWNER role reached a staff-only page");
    }
  }

  // STAFF (not admin) must not reach admin-only money pages.
  for (const [tag, email] of [["ALPHA", "alpha-staff@test.local"], ["BRAVO", "bravo-staff@test.local"]]) {
    const { jar } = await login(email);
    for (const p of ["/payroll", "/payroll/employees", `/payroll/${ids[tag].run}`, "/team", "/billing"]) {
      checks++;
      const r = await get(jar, p);
      if (r.status === 200 && !r.redirect) fail(`${tag} staff`, p, "admin-only page opened by STAFF role");
    }
  }

  // Unauthenticated
  const anon = new Jar();
  for (const p of ["/dashboard", "/properties", "/rent", `/rent/${A.lease}`, `/payouts/${A.payout}/statement`, `/leases/${A.lease}/clearance`, "/team", "/platform"]) {
    checks++;
    const r = await get(anon, p);
    if (!r.redirect) fail("anonymous", p, `not redirected (status ${r.status})`);
  }
  checks++;
  let r = await req(anon, `/api/photos/${A.photo}`);
  if (r.status === 200) fail("anonymous", "private photo", "served to anonymous user");
  // public vacancy page + its photos are intentionally public; must not leak private fields
  checks++;
  r = await get(anon, `/v/${A.unit2}`);
  if (r.status !== 200) fail("anonymous", "vacancy page", `status ${r.status}`);
  for (const secret of ["ALPHA Owner", "0711000001", "ALPHA Tenant", "0722000001", "ALPHA Road", "ALPHA-ID"]) {
    checks++;
    if (r.text.includes(secret)) fail("anonymous", "vacancy page", `exposes "${secret}"`);
  }
  // unit1 (not listed) must not be public
  checks++;
  r = await get(anon, `/v/${A.unit1}`);
  if (r.status === 200) fail("anonymous", "unlisted unit page", "unlisted unit served publicly");

  console.log(`\nchecks run: ${checks}`);
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`);
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  } else {
    console.log("ALL ISOLATION CHECKS PASSED");
  }
}
main().catch((e) => { console.error(e); process.exit(2); });
