// Identity and access tests: custom roles, suspension, forced password change, lockout, escalation.
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3055";
const ids = JSON.parse(fs.readFileSync("./ids.json", "utf8"));

class Session {
  jar = new Map();
  async raw(path, opts = {}) {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      ...opts,
      headers: { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), origin: BASE, connection: "close", ...(opts.headers ?? {}) },
    });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (!v) this.jar.delete(k); else this.jar.set(k, v);
    }
    return res;
  }
  async login(email, password = "Passw0rd!x") {
    const { csrfToken } = await (await this.raw("/api/auth/csrf")).json();
    await this.raw("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE + "/dashboard", json: "true" }),
    });
    const s = await (await this.raw("/api/auth/session")).json();
    return !!s?.user;
  }
  /** status plus redirect target, following nothing */
  async probe(path) {
    const r = await this.raw(path);
    const body = r.status === 200 ? await r.text() : "";
    return { status: r.status, location: r.headers.get("location") ?? "", body };
  }
}

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-zA-Z_:$-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
async function postForm(session, pagePath, fieldName, overrides) {
  const html = await (await session.raw(pagePath)).text();
  const form = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => new RegExp(`name="${fieldName}"`).test(f));
  if (!form) throw new Error(`no form with ${fieldName} on ${pagePath}`);
  const fd = new FormData();
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.type === "hidden" && a.name) fd.set(a.name, (a.value ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  const res = await session.raw(pagePath, { method: "POST", body: fd });
  await res.text();
  return res.status;
}

const db = (cmd) => JSON.parse(execSync(`npx tsx scripts/isolation-test/iam-db.ts ${cmd}`, { encoding: "utf8" }).trim().split("\n").pop());

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const blocked = (r) => r.status === 307 || r.status === 302 || r.status === 404 || r.status === 403;

// 1. Custom role "Caretaker" (maintenance only)
{
  const s = new Session();
  check("caretaker can sign in", await s.login("alpha-caretaker@test.local"));
  const ok = await s.probe("/maintenance");
  check("caretaker can open repairs", ok.status === 200);
  check("caretaker can log a repair (new)", (await s.probe("/maintenance/new")).status === 200);
  for (const p of ["/rent", "/rent/confirm", "/payroll", "/team", "/team/roles", "/invoices", "/owners", "/tenants", "/payouts", "/utilities", "/notifications", "/billing", "/suppliers"]) {
    const r = await s.probe(p);
    check(`caretaker blocked from ${p}`, blocked(r), `status ${r.status}`);
  }
  const dash = await s.probe("/dashboard");
  check("caretaker menu shows Repairs but not Collect rent / Payroll", dash.body.includes('href="/maintenance"') && !dash.body.includes('href="/rent"') && !dash.body.includes('href="/payroll"'));

  // 5. changing the role applies immediately, without signing in again
  db("grant-caretaker-rent");
  const after = await s.probe("/rent");
  check("role change applies immediately (no re-login)", after.status === 200, `status ${after.status}`);
  db("revoke-caretaker-rent");
  check("permission removal also immediate", blocked(await s.probe("/rent")));
}

// 2. Suspended user cannot sign in
{
  const s = new Session();
  check("suspended user cannot sign in", !(await s.login("alpha-suspended@test.local")));
}

// 3. Suspending a signed-in user cuts them off at once
{
  const s = new Session();
  await s.login("alpha-victim@test.local");
  check("victim can use the app before suspension", (await s.probe("/maintenance")).status === 200);
  db("suspend-victim");
  const r = await s.probe("/maintenance");
  check("suspension takes effect on the very next request", r.status === 307 && /login/.test(r.location), `status ${r.status} -> ${r.location}`);
  db("restore-victim");
}

// 4. Temporary password must be changed first
{
  const s = new Session();
  check("temp-password user can sign in", await s.login("alpha-temp@test.local"));
  const r = await s.probe("/dashboard");
  check("forced to change password before anything else", r.status === 307 && /account\/password/.test(r.location), `status ${r.status} -> ${r.location}`);
  check("password page is reachable", (await s.probe("/account/password?required=1")).status === 200);
  const r2 = await s.probe("/rent");
  check("cannot skip to another page", r2.status === 307 && /account\/password/.test(r2.location));
}

// 6. Brute-force lockout
{
  const s = new Session();
  for (let i = 0; i < 5; i++) await s.login("alpha-lock@test.local", "wrong-password-" + i);
  const state = db("lock-state");
  check("5 wrong passwords lock the account", !!state.lockedUntil, JSON.stringify(state));
  check("correct password is refused while locked", !(await new Session().login("alpha-lock@test.local")));
  db("unlock");
  check("works again once unlocked", await new Session().login("alpha-lock@test.local"));
}

// 7. Privilege escalation is blocked for a custom-role team manager
{
  const s = new Session();
  await s.login("alpha-teamlead@test.local");
  check("team lead can open Team and access", (await s.probe("/team")).status === 200);
  await postForm(s, "/team/roles", "name", { name: "ESCALATE", description: "x", "perm_payroll.manage": "on" });
  check("cannot create a role containing a permission they lack", db("role-exists ESCALATE").exists === false);
  await postForm(s, "/team/roles", "name", { name: "OKROLE", description: "x", "perm_maintenance.manage": "on" });
  check("can create a role within their own permissions", db("role-exists OKROLE").exists === true);
  await postForm(s, "/team", "password", { name: "Sneaky Admin", email: "sneaky-admin@test.local", password: "Passw0rd!x", role: "ADMIN" });
  check("cannot create an admin", db("user-role sneaky-admin@test.local").role === null);
  await postForm(s, "/team", "password", { name: "Wide Staff", email: "wide-staff@test.local", password: "Passw0rd!x", role: `custom:${ids.ALPHA.caretakerRole}` });
  check("can add someone with a role they are allowed to grant", db("user-role wide-staff@test.local").role === "STAFF");
  // cannot touch another company's role or member
  check("other company's role page is not reachable", blocked(await s.probe(`/team/roles/${ids.BRAVO.role}`)));
  check("other company's member page is not reachable", blocked(await s.probe(`/team/${ids.BRAVO.staffUser}`)));
}

// 8. Plain staff can't reach team pages; audit trail exists
{
  const s = new Session();
  await s.login("alpha-staff@test.local");
  for (const p of ["/team", "/team/roles", "/team/audit", `/team/${ids.ALPHA.victimUser}`]) {
    check(`staff blocked from ${p}`, blocked(await s.probe(p)));
  }
  const admin = new Session();
  await admin.login("alpha-admin@test.local");
  const audit = await admin.probe("/team/audit");
  check("admin can read the activity log", audit.status === 200 && /Created a role|Added a team member|locked/.test(audit.body), `status ${audit.status}`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL IAM CHECKS PASSED");
process.exit(failed ? 1 : 0);
