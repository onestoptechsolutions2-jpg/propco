/**
 * Takes the screenshots used in the manuals, from the REAL app running on demo data.
 * Run it through scripts/docs/screenshots.sh, which resets the demo database, starts the app and calls this.
 * Needs Playwright with Chromium (`pnpm dlx playwright install chromium`; pre-installed in some sandboxes).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Playwright is resolved the CommonJS way so a globally installed copy (NODE_PATH) is found too.
const { chromium } = createRequire(import.meta.url)("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.DOCS_APP_URL || "http://localhost:3080";
const OUT = path.join(here, "../../docs/images");
const PASSWORD = "DemoPass#2026";
const ADMIN = "wanjiru@mwangaza.example";
const STAFF = "peter@mwangaza.example";
const OPERATOR = "support@propco.example";

fs.mkdirSync(OUT, { recursive: true });
let count = 0;

async function shot(page, name, opts = {}) {
  if (opts.url) await page.goto(BASE + opts.url, { waitUntil: "domcontentloaded" });
  // The live-update stream never goes idle, so wait for the page to settle by hand.
  await page.waitForTimeout(opts.wait ?? 900);
  if (opts.before) await opts.before(page);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82, fullPage: !!opts.full });
  count++;
  console.log("  ✓", name);
}

async function signIn(page, email) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
  await page.waitForTimeout(600);
}

const firstHref = async (page, pattern) =>
  page.$$eval("a", (as, p) => as.map((a) => a.getAttribute("href")).find((h) => h && new RegExp(p).test(h)) ?? null, pattern);

const BOX = 'input[name="text"]:not([type="hidden"])';
async function say(page, text) {
  await page.waitForSelector(BOX, { timeout: 20000 });
  await page.fill('input[name="text"]:not([type="hidden"])', text);
  await Promise.all([page.waitForURL("**/chat", { timeout: 15000 }), page.press('input[name="text"]:not([type="hidden"])', "Enter")]);
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch();

  // ===== Desktop, the company's admin =====
  const desk = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await desk.newPage();
  console.log("Signed out");
  await shot(page, "login", { url: "/login" });

  console.log("Signing in as the company admin");
  await signIn(page, ADMIN);

  console.log("Chat");
  await shot(page, "chat-start", { url: "/chat" });
  await say(page, "John Kariuki paid rent 38000 mpesa");
  await shot(page, "chat-confirm");
  await page.click('button:has-text("Confirm:")');
  await page.waitForSelector("text=Recorded", { timeout: 20000 });
  await shot(page, "chat-done");
  await say(page, "Who owes rent?");
  await shot(page, "chat-owes");
  await say(page, "Paid 3500 fuel for site visits");
  await shot(page, "chat-books");
  await say(page, "Leak in Kilimani Heights B1 kitchen");
  await shot(page, "chat-repair");

  console.log("Main screens");
  await shot(page, "dashboard", { url: "/dashboard" });
  await shot(page, "properties", { url: "/properties" });
  const propHref = await firstHref(page, "^/properties/[a-z0-9]{20,}$");
  if (propHref) await shot(page, "property-detail", { url: propHref });
  await shot(page, "tenants", { url: "/tenants" });
  const tenantEdit = await firstHref(page, "^/tenants/[a-z0-9]{20,}/edit$");
  if (tenantEdit) await shot(page, "tenant-edit", { url: tenantEdit, full: false });
  await shot(page, "tenant-new", { url: "/tenants/new" });
  await shot(page, "leases", { url: "/leases" });

  console.log("Rent");
  await shot(page, "rent-roll", { url: "/rent" });
  const leaseHref = await firstHref(page, "^/rent/[a-z0-9]{20,}$");
  if (leaseHref) {
    await shot(page, "lease-payments", { url: leaseHref });
    await shot(page, "invoice", { url: `${leaseHref}/invoice` });
    await page.goto(BASE + leaseHref, { waitUntil: "domcontentloaded" });
    const receipt = await firstHref(page, "/receipt/");
    if (receipt) await shot(page, "receipt", { url: receipt });
  }
  await shot(page, "confirm-mpesa", { url: "/rent/confirm" });

  console.log("Repairs and suppliers");
  await shot(page, "maintenance", { url: "/maintenance" });
  const repairHref = await firstHref(page, "^/maintenance/[a-z0-9]{20,}$");
  if (repairHref) await shot(page, "maintenance-detail", { url: repairHref });
  await shot(page, "maintenance-new", { url: "/maintenance/new" });
  await shot(page, "maintenance-schedule", { url: "/maintenance/schedule" });
  await shot(page, "suppliers", { url: "/suppliers" });
  await shot(page, "invoices", { url: "/invoices" });

  console.log("Owners and money");
  await shot(page, "owners", { url: "/owners" });
  const ownerHref = await firstHref(page, "^/owners/[a-z0-9]{20,}$");
  if (ownerHref) await shot(page, "owner-detail", { url: ownerHref });
  await page.goto(BASE + "/payouts", { waitUntil: "domcontentloaded" });
  await page.click('button:has-text("Generate payouts")'); // run the real action so the table has rows
  await page.waitForTimeout(1500);
  await shot(page, "payouts", { url: "/payouts" });
  const stmt = await firstHref(page, "/statement");
  if (stmt) await shot(page, "payout-statement", { url: stmt });
  await shot(page, "books", { url: "/books" });
  await shot(page, "insights", { url: "/insights" });
  await shot(page, "insights-more", { url: "/insights", before: (p) => p.evaluate(() => window.scrollTo(0, 900)) });
  await shot(page, "utilities", { url: "/utilities" });
  await shot(page, "payroll", { url: "/payroll" });
  await page.click('button:has-text("Start payroll run")'); // real action, so the run page has payslips to show
  await page.waitForURL(/\/payroll\/[a-z0-9]{20,}/, { timeout: 20000 });
  await shot(page, "payroll-run");

  console.log("Messages, team and settings");
  await shot(page, "notifications", { url: "/notifications" });
  await shot(page, "team", { url: "/team" });
  const memberHref = await firstHref(page, "^/team/[a-z0-9]{20,}$");
  if (memberHref) await shot(page, "team-member", { url: memberHref });
  await shot(page, "roles", { url: "/team/roles" });
  await shot(page, "audit", { url: "/team/audit" });
  await shot(page, "online-payments", { url: "/settings/payments" });
  await shot(page, "billing", { url: "/billing" });
  await shot(page, "guide", { url: "/guide" });
  await shot(page, "account", { url: "/account" });

  // ===== Phone =====
  console.log("Phone");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await phone.newPage();
  await signIn(m, STAFF); // a fresh chat history, so the phone screenshot starts clean
  await m.goto(BASE + "/chat", { waitUntil: "domcontentloaded" });
  await say(m, "Mary Njeri paid rent 38000 mpesa");
  await shot(m, "mobile-chat");
  await shot(m, "mobile-rent", { url: "/rent" });
  await shot(m, "mobile-more", { url: "/dashboard", before: async (p) => { await p.click('button:has-text("More")'); await p.waitForTimeout(500); } });
  await phone.close();

  // ===== PropCo's own admin console =====
  console.log("PropCo admin console");
  const op = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const o = await op.newPage();
  await signIn(o, OPERATOR);
  await shot(o, "admin-overview", { url: "/platform", wait: 1200 });
  await shot(o, "admin-customers", { url: "/platform", wait: 800, before: (p) => p.evaluate(() => window.scrollTo(0, 700)) });
  const customerHref = await o.getByRole("link", { name: "Mwangaza Property Managers" }).first().getAttribute("href");
  if (customerHref) {
    await shot(o, "admin-customer", { url: customerHref });
    await shot(o, "admin-customer-people", { url: customerHref, before: (p) => p.evaluate(() => window.scrollTo(0, 420)) });
    await shot(o, "admin-customer-activity", { url: customerHref, before: (p) => p.evaluate(() => window.scrollTo(0, 5000)) });
  }
  await op.close();

  await browser.close();
  console.log(`\n${count} screenshots written to docs/images`);
})().catch((e) => { console.error(e); process.exit(1); });
