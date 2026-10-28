/**
 * End-to-end test of the PropCo admin console. Use scripts/platform-test/run.sh.
 * Creates its own companies and people and removes them afterwards.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as ops from "../../src/lib/platform-ops";
import { customerPage, statusWhere, systemHealth, STATUS_FILTERS } from "../../src/lib/platform";
import { orgStatus } from "../../src/lib/plans";

const APP = process.env.APP_URL_TEST || "http://localhost:3060";
const db = new PrismaClient();
const OPERATOR = process.env.PLATFORM_ADMIN_EMAILS!.split(",")[0];
const TAG = `pt${Date.now()}`;
const DAY = 86_400_000;

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : `  (${extra})`}`);
  if (!ok) failures++;
};

/** Minimal cookie-jar login against NextAuth credentials. Returns the cookie header, or null if sign-in failed. */
async function login(email: string, password: string): Promise<string | null> {
  const jar = new Map<string, string>();
  const take = (res: Response) => res.headers.getSetCookie().forEach((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${APP}/api/auth/csrf`);
  take(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${APP}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${APP}/chat` }),
  });
  take(res);
  return [...jar.keys()].some((k) => k.includes("session-token")) ? cookie() : null;
}
const get = (path: string, cookie: string) => fetch(APP + path, { headers: { Cookie: cookie }, redirect: "manual" });
const text = async (r: Response) => (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function org(name: string, data: object = {}) {
  return db.organization.create({ data: { name: `${TAG} ${name}`, trialEndsAt: new Date(Date.now() - DAY), ...data } });
}
async function person(orgId: string | null, email: string, password: string, role: "ADMIN" | "STAFF" = "ADMIN") {
  return db.user.create({ data: { orgId, email, name: email.split("@")[0], role, passwordHash: await bcrypt.hash(password, 4) } });
}

async function main() {
  const now = Date.now();
  const orgs = {
    trial: await org("trial", { trialEndsAt: new Date(now + 5 * DAY) }),
    paying: await org("paying", { plan: "GROWTH", paidUntil: new Date(now + 20 * DAY) }),
    lapsed: await org("lapsed", { plan: "PRO", paidUntil: new Date(now - 3 * DAY) }),
    free: await org("free"),
    suspended: await org("suspended", { suspendedAt: new Date(), suspendedReason: "test" }),
  };
  const customer = await org("customer", { plan: "GROWTH", paidUntil: new Date(now + 10 * DAY) });
  const operatorOrg = await org("operator-home", { plan: "SCALE", paidUntil: new Date(now + 30 * DAY) });
  const ids = [...Object.values(orgs).map((o) => o.id), customer.id, operatorOrg.id];

  const operator = await person(operatorOrg.id, OPERATOR, "Operator#12345");
  const owner = await person(customer.id, `owner.${TAG}@example.test`, "OwnerPass#1");
  const clerk = await person(customer.id, `clerk.${TAG}@example.test`, "ClerkPass#1", "STAFF");
  const stranger = await person(orgs.free.id, `stranger.${TAG}@example.test`, "Stranger#1");
  const frozen = await person(orgs.suspended.id, `frozen.${TAG}@example.test`, "Frozen#123");

  try {
    // ---- status filters in SQL agree with the app's own orgStatus() rules
    let agree = true;
    for (const f of STATUS_FILTERS.filter((x) => x !== "all")) {
      const rows = await customerPage({ q: TAG, status: f, page: 1, size: 50 });
      const got = rows.rows.map((r) => r.name.replace(`${TAG} `, "")).sort().join(",");
      const expected = Object.entries(orgs).map(([k, o]) => [k, o] as const).concat([["customer", customer], ["operator-home", operatorOrg]] as never)
        .filter(([, o]) => {
          const st = orgStatus(o, new Date());
          if (f === "suspended") return !!o.suspendedAt;
          if (o.suspendedAt) return false;
          if (f === "trial") return st.inTrial;
          if (f === "paying") return !st.inTrial && st.subscribed;
          if (f === "lapsed") return st.lapsed;
          return !st.inTrial && !st.subscribed && !st.lapsed;
        }).map(([k]) => k).sort().join(",");
      if (got !== expected) { agree = false; console.log(`   ${f}: got [${got}] expected [${expected}]`); }
    }
    check("status filters match the app's plan rules", agree);
    const byEmail = await customerPage({ q: `clerk.${TAG}`, status: "all", page: 1, size: 50 });
    check("search finds a company by a user's email", byEmail.rows.length === 1 && byEmail.rows[0].id === customer.id);
    const bySuffix = await customerPage({ q: customer.id.slice(-8).toUpperCase(), status: "all", page: 1, size: 50 });
    check("search finds a company by its account number", bySuffix.rows.some((r) => r.id === customer.id));

    // ---- support operations
    await db.user.update({ where: { id: clerk.id }, data: { failedLogins: 4, lockedUntil: new Date(now + 600_000) } });
    await ops.unlockUser(OPERATOR, customer.id, clerk.id);
    const c1 = await db.user.findUniqueOrThrow({ where: { id: clerk.id } });
    check("unlock clears the lock and the counter", c1.failedLogins === 0 && c1.lockedUntil === null);
    let crossOrg = false;
    try { await ops.unlockUser(OPERATOR, orgs.free.id, clerk.id); } catch { crossOrg = true; }
    check("cannot act on a person through the wrong company", crossOrg);

    await ops.forcePasswordChange(OPERATOR, customer.id, owner.id);
    check("force password change sets the flag", (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).mustChangePassword);

    await ops.setUserActive(OPERATOR, customer.id, clerk.id, false);
    check("suspending a person works", !(await db.user.findUniqueOrThrow({ where: { id: clerk.id } })).active);
    await ops.setUserActive(OPERATOR, customer.id, clerk.id, true);

    await ops.activatePlan(OPERATOR, orgs.free.id, "PRO", 2);
    const f1 = await db.organization.findUniqueOrThrow({ where: { id: orgs.free.id } });
    const days = Math.round((f1.paidUntil!.getTime() - now) / DAY);
    check("activate plan sets plan and 60 days", f1.plan === "PRO" && days >= 59 && days <= 61, `${f1.plan} ${days}`);
    await ops.extendTrial(OPERATOR, orgs.free.id);
    check("extend trial adds 14 days from today when expired", Math.round(((await db.organization.findUniqueOrThrow({ where: { id: orgs.free.id } })).trialEndsAt.getTime() - now) / DAY) === 14);

    await ops.addNote(OPERATOR, customer.id, "Called about M-Pesa keys");
    check("note saved with author", (await db.supportNote.findFirst({ where: { orgId: customer.id } }))?.authorEmail === OPERATOR);
    let emptyNote = false;
    try { await ops.addNote(OPERATOR, customer.id, " "); } catch { emptyNote = true; }
    check("empty note refused", emptyNote);

    let selfSuspend = false;
    try { await ops.suspendOrg(OPERATOR, operatorOrg.id, operatorOrg.id, "oops"); } catch { selfSuspend = true; }
    check("operators cannot suspend their own company", selfSuspend);

    const audit = await db.auditLog.findMany({ where: { orgId: customer.id, actorName: `Support: ${OPERATOR}` } });
    check("every support action is in the customer's activity log", audit.length >= 4 && audit.every((a) => a.action.startsWith("support.")), String(audit.length));

    // ---- website behaviour
    const op = await login(OPERATOR, "Operator#12345");
    check("operator can sign in", !!op);
    const page = await get("/platform", op!);
    const html = await text(page);
    check("operator sees the admin overview", page.status === 200 && html.includes("System health") && html.includes("Needs attention"), String(page.status));
    const detail = await get(`/platform/${customer.id}`, op!);
    const dhtml = await text(detail);
    check("operator sees the customer page", detail.status === 200 && dhtml.includes(`owner.${TAG}@example.test`) && dhtml.includes("Called about M-Pesa keys") && dhtml.includes(`Support: ${OPERATOR}`), String(detail.status));
    check("customer page never shows password hashes or keys", !dhtml.includes("$2") && !/passkey|secret/i.test(dhtml.replace(/Consumer secret/gi, "")));
    const found = await get(`/platform?q=${TAG}`, op!);
    check("search page lists the test companies", (await text(found)).includes(`${TAG} customer`));
    check("unknown company is a 404", (await get("/platform/does-not-exist", op!)).status === 404);

    const normal = await login(`clerk.${TAG}@example.test`, "ClerkPass#1");
    check("an ordinary customer can sign in", !!normal);
    check("customers get 404 for /platform", (await get("/platform", normal!)).status === 404);
    check("customers get 404 for another company's page", (await get(`/platform/${orgs.paying.id}`, normal!)).status === 404);
    check("not-signed-in is sent to login", (await fetch(`${APP}/platform`, { redirect: "manual" })).status >= 300);

    // ---- suspension
    await ops.suspendOrg(OPERATOR, operatorOrg.id, customer.id, "Chargeback dispute");
    check("suspended company's people cannot sign in", (await login(`clerk.${TAG}@example.test`, "ClerkPass#1")) === null);
    const stillIn = await get("/dashboard", normal!);
    check("people already signed in are cut off", stillIn.status >= 300 && (stillIn.headers.get("location") ?? "").includes("Suspended"), `${stillIn.status} ${stillIn.headers.get("location")}`);
    check("a suspended company shows in the Suspended filter", (await customerPage({ q: TAG, status: "suspended", page: 1, size: 50 })).rows.some((r) => r.id === customer.id));
    await ops.unsuspendOrg(OPERATOR, customer.id);
    check("reactivated company can sign in again", !!(await login(`clerk.${TAG}@example.test`, "ClerkPass#1")));
    check("frozen-from-the-start company stays blocked", (await login(`frozen.${TAG}@example.test`, "Frozen#123")) === null);

    // ---- temporary password
    const issued = await ops.issueTempPassword(OPERATOR, customer.id, owner.id);
    check("temporary password is 12 readable characters", /^[a-zA-Z2-9]{12}$/.test(issued.temp) && !/[0OIl1]/.test(issued.temp));
    check("old password stops working", (await login(`owner.${TAG}@example.test`, "OwnerPass#1")) === null);
    const viaTemp = await login(`owner.${TAG}@example.test`, issued.temp);
    check("temporary password works", !!viaTemp);
    const forced = await get("/dashboard", viaTemp!);
    check("and forces a new password straight away", forced.status >= 300 && (forced.headers.get("location") ?? "").includes("/account/password"), forced.headers.get("location") ?? "");
    const stored = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    check("the temporary password is stored hashed only", stored.passwordHash !== issued.temp && stored.passwordHash!.startsWith("$2"));
    check("issuing it is logged without the password", !(await db.auditLog.findMany({ where: { orgId: customer.id } })).some((a) => (a.detail ?? "").includes(issued.temp)));

    // ---- heartbeats
    await db.systemHeartbeat.upsert({ where: { name: "worker" }, create: { name: "worker", seenAt: new Date() }, update: { seenAt: new Date() } });
    check("health reports a fresh worker as alive", (await systemHealth()).workerOk);
    await db.systemHeartbeat.update({ where: { name: "worker" }, data: { seenAt: new Date(Date.now() - 10 * 60_000) } });
    check("and a silent worker as down", !(await systemHealth()).workerOk);
  } finally {
    await db.supportNote.deleteMany({ where: { orgId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { orgId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: [operator.id, owner.id, clerk.id, stranger.id, frozen.id] } } });
    await db.user.deleteMany({ where: { id: { in: [operator.id, owner.id, clerk.id, stranger.id, frozen.id] } } });
    await db.organization.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
