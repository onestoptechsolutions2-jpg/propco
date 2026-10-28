/**
 * End-to-end test of agents, commissions and owner money. Use scripts/agents-test/run.sh.
 * Creates its own company and removes it afterwards.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { commissionFor, commissionsDue } from "../../src/lib/agents";
import { ownerMoney, holdAndOwe } from "../../src/lib/owner-money";

const APP = process.env.APP_URL_TEST || "http://localhost:3061";
const db = new PrismaClient();
const TAG = `ag${Date.now()}`;
const DAY = 86_400_000;

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : `  (${extra})`}`);
  if (!ok) failures++;
};

async function login(email: string, password: string): Promise<string | null> {
  const jar = new Map<string, string>();
  const take = (res: Response) => res.headers.getSetCookie().forEach((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${APP}/api/auth/csrf`);
  take(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${APP}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${APP}/dashboard` }),
  });
  take(res);
  return [...jar.keys()].some((k) => k.includes("session-token")) ? cookie() : null;
}
const get = (path: string, cookie: string) => fetch(APP + path, { headers: { Cookie: cookie }, redirect: "manual" });
const text = async (r: Response) => (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function main() {
  const org = await db.organization.create({ data: { name: `${TAG} org`, trialEndsAt: new Date(Date.now() - DAY), plan: "GROWTH", paidUntil: new Date(Date.now() + 30 * DAY) } });
  const other = await db.organization.create({ data: { name: `${TAG} other`, trialEndsAt: new Date(Date.now() - DAY), plan: "GROWTH", paidUntil: new Date(Date.now() + 30 * DAY) } });
  const hash = await bcrypt.hash("Passw0rd#1", 4);
  const admin = await db.user.create({ data: { orgId: org.id, email: `admin.${TAG}@example.test`, name: "Admin", role: "ADMIN", passwordHash: hash } });
  const clerk = await db.user.create({ data: { orgId: org.id, email: `clerk.${TAG}@example.test`, name: "Clerk", role: "STAFF", passwordHash: hash } });
  try {
    // ---- commission maths
    check("percent commission is a share of the first rent", commissionFor({ basis: "PERCENT_OF_FIRST_RENT", rate: 50 }, 30000) === 15000);
    check("flat commission ignores the rent", commissionFor({ basis: "FLAT", rate: 2500 }, 30000) === 2500);

    // ---- data: one owner, one property, two leases
    const owner = await db.owner.create({ data: { orgId: org.id, name: "Grace Owner" } });
    const prop = await db.property.create({ data: { orgId: org.id, ownerId: owner.id, name: "Test Court", addressLine1: "1 Road", commissionPct: 10 } });
    const u1 = await db.unit.create({ data: { propertyId: prop.id, label: "A1", rentAmount: 30000, status: "OCCUPIED" } });
    const u2 = await db.unit.create({ data: { propertyId: prop.id, label: "A2", rentAmount: 20000, status: "OCCUPIED" } });
    const t1 = await db.tenant.create({ data: { orgId: org.id, name: "Tina Tenant" } });
    const t2 = await db.tenant.create({ data: { orgId: org.id, name: "Tom Tenant" } });
    const agent = await db.agent.create({ data: { orgId: org.id, name: "Ann Agent", rate: 50 } });
    const foreign = await db.agent.create({ data: { orgId: other.id, name: "Foreign Agent", rate: 10 } });
    const l1 = await db.lease.create({ data: { unitId: u1.id, tenantId: t1.id, startDate: new Date(), rentAmount: 30000, agentId: agent.id, source: "AGENT", agentCommission: commissionFor(agent, 30000) } });
    const l2 = await db.lease.create({ data: { unitId: u2.id, tenantId: t2.id, startDate: new Date(), rentAmount: 20000, agentId: agent.id, source: "AGENT", agentCommission: commissionFor(agent, 20000) } });

    check("nothing is due before first rent is paid", (await commissionsDue(org.id)).length === 0);
    await db.payment.create({ data: { leaseId: l1.id, amount: 30000, dueDate: new Date(), paidDate: new Date(), status: "PAID" } });
    await db.payment.create({ data: { leaseId: l2.id, amount: 20000, dueDate: new Date(), status: "LATE" } });
    const due = await commissionsDue(org.id);
    check("commission becomes due once first rent is paid", due.length === 1 && due[0].id === l1.id && Number(due[0].agentCommission) === 15000);
    check("another company never sees these commissions", (await commissionsDue(other.id)).length === 0 && foreign.orgId === other.id);

    // ---- owner money: 30,000 collected, 10% commission, no repairs, nothing paid out
    let m = (await ownerMoney(org.id))[0];
    check("owner money holds collected less commission", m.collected === 30000 && m.commission === 3000 && m.held === 27000, JSON.stringify(m));
    await db.payout.create({ data: { ownerId: owner.id, periodStart: new Date(Date.UTC(2026, 0, 1)), periodEnd: new Date(Date.UTC(2026, 0, 31)), grossRent: 30000, commission: 3000, netAmount: 27000, status: "PAID" } });
    m = (await ownerMoney(org.id))[0];
    check("a paid payout reduces what is held", m.paidOut === 27000 && m.held === 0);
    const hold = await holdAndOwe(org.id);
    check("rent owed to you counts unpaid, past-due rent", hold.rentOwedToYou === 20000, String(hold.rentOwedToYou));

    // ---- pages and permissions
    const ac = await login(admin.email!, "Passw0rd#1");
    const cc = await login(clerk.email!, "Passw0rd#1");
    check("both people can sign in", !!ac && !!cc);
    if (ac && cc) {
      const a = await get("/agents", ac);
      const body = await text(a);
      check("agents page lists the agent and the due commission", a.status === 200 && body.includes("Ann Agent") && body.includes("15,000"), String(a.status));
      const detail = await get(`/agents/${agent.id}`, ac);
      check("agent page shows both leases", detail.status === 200 && (await text(detail)).includes("Waiting for first rent"));
      check("another company's agent is not found", (await get(`/agents/${foreign.id}`, ac)).status === 404);
      const om = await get("/books/owners", ac);
      check("owner money page renders", om.status === 200 && (await text(om)).includes("Grace Owner"));
      const csv = await get("/books/owners/export", ac);
      check("owner money CSV downloads", csv.status === 200 && (csv.headers.get("content-type") ?? "").includes("text/csv") && (await csv.text()).includes("Grace Owner"));
      const books = await text(await get("/books", ac));
      check("books shows what you hold and owe", books.includes("Held for owners") && books.includes("Rent owed to you"));
      const today = await text(await get("/dashboard", ac));
      check("Today asks you to pay the due commission", today.includes("agent commission is due"));
      check("staff cannot open agents", (await get("/agents", cc)).status >= 300);
      check("staff cannot open owner money", (await get("/books/owners", cc)).status >= 300);
    }
  } finally {
    const orgIds = [org.id, other.id];
    await db.payout.deleteMany({ where: { owner: { orgId: { in: orgIds } } } });
    await db.payment.deleteMany({ where: { lease: { unit: { property: { orgId: { in: orgIds } } } } } });
    await db.lease.deleteMany({ where: { unit: { property: { orgId: { in: orgIds } } } } });
    await db.unit.deleteMany({ where: { property: { orgId: { in: orgIds } } } });
    await db.property.deleteMany({ where: { orgId: { in: orgIds } } });
    await db.owner.deleteMany({ where: { orgId: { in: orgIds } } });
    await db.tenant.deleteMany({ where: { orgId: { in: orgIds } } });
    await db.agent.deleteMany({ where: { orgId: { in: orgIds } } });
    await db.auditLog.deleteMany({ where: { orgId: { in: orgIds } } }).catch(() => {});
    await db.user.deleteMany({ where: { orgId: { in: orgIds } } });
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.$disconnect();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
