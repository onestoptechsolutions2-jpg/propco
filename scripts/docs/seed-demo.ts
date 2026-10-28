/**
 * Fills an EMPTY database with a believable demo company so the manuals can show real screens.
 *   DATABASE_URL=... PAYMENTS_ENCRYPTION_KEY=... npx tsx scripts/docs/seed-demo.ts
 * Never run against production: it creates users with a published password.
 * Everything here is invented (names, numbers, phone numbers use the 07xx xxx range with made-up digits).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { saveOrgSettings } from "../../src/lib/payments/config";

export const DEMO = {
  password: "DemoPass#2026",
  admin: "wanjiru@mwangaza.example",
  staff: "peter@mwangaza.example",
  accountant: "faith@mwangaza.example",
  operator: "support@propco.example",
};

const db = new PrismaClient();
const DAY = 86_400_000;
const now = new Date();
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // deterministic, so screenshots are stable
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const monthsAgo = (m: number, day: number) => new Date(now.getFullYear(), now.getMonth() - m, day, 9, 30);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const code = () => Array.from({ length: 10 }, () => ALPHABET[Math.floor(rnd() * ALPHABET.length)]).join("");

async function main() {
  // A fresh migrated database holds only the empty placeholder company; anything more means real data.
  await db.organization.deleteMany({ where: { id: "org_default", users: { none: {} }, properties: { none: {} } } });
  if ((await db.organization.count()) > 0) throw new Error("Refusing to seed: this database already has data.");
  const hash = await bcrypt.hash(DEMO.password, 10);

  // ---------- The demo company ----------
  const org = await db.organization.create({
    data: {
      name: "Mwangaza Property Managers",
      plan: "GROWTH",
      trialEndsAt: new Date(now.getTime() - 60 * DAY),
      paidUntil: new Date(now.getTime() + 21 * DAY),
      contactPhone: "0722 100 200",
      payInstructions: "Pay by M-Pesa Paybill 400200, account: your unit number.\nBank: Equity Bank, A/C 0123 4567 8901, Mwangaza Property Managers.",
      approvalLimit: 50000,
      billingNote: "Growth activated for 1 month(s)",
    },
  });
  const operatorOrg = await db.organization.create({
    data: { name: "PropCo Support", plan: "SCALE", trialEndsAt: now, paidUntil: new Date(now.getTime() + 3650 * DAY) },
  });

  const mkUser = (orgId: string, email: string, name: string, role: "ADMIN" | "STAFF", extra: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
    db.user.create({ data: { orgId, email, name, role, passwordHash: hash, lastLoginAt: new Date(now.getTime() - 3_600_000), ...extra } });
  const admin = await mkUser(org.id, DEMO.admin, "Wanjiru Kamau", "ADMIN");
  await mkUser(org.id, DEMO.staff, "Peter Otieno", "STAFF");
  const accountantRole = await db.orgRole.create({
    data: {
      orgId: org.id,
      name: "Accountant",
      description: "Sees money in and out. Cannot change tenants or properties.",
      permissions: ["rent.manage", "books.manage", "payouts.view", "payouts.manage", "invoices.manage", "supplier_payments.manage"],
    },
  });
  await mkUser(org.id, DEMO.accountant, "Faith Achieng", "STAFF", { orgRoleId: accountantRole.id, lastLoginAt: new Date(now.getTime() - 26 * 3_600_000) });
  await mkUser(operatorOrg.id, DEMO.operator, "Support Team", "ADMIN");

  // ---------- Owners and properties ----------
  const ownerData = [
    ["Grace Mutua", "grace.mutua@example.com", "0711 200 301"],
    ["James Mwangi", "james.mwangi@example.com", "0722 200 302"],
    ["Amina Hassan", "amina.hassan@example.com", "0733 200 303"],
    ["Samuel Kiptoo", "samuel.kiptoo@example.com", "0700 200 304"],
  ] as const;
  const owners = [];
  for (const [name, email, phone] of ownerData) {
    owners.push(await db.owner.create({ data: { orgId: org.id, name, email, phone, payoutMethod: "mpesa", mpesaNumber: phone.replace(/\s/g, ""), notifyChannel: "WHATSAPP" } }));
  }
  const propSpec = [
    { name: "Kilimani Heights", addr: "Argwings Kodhek Road", city: "Nairobi", owner: 0, type: "BUILDING" as const, units: [["A1", 2, 38000], ["A2", 2, 38000], ["B1", 1, 26000], ["B2", 1, 26000], ["C1", 3, 55000], ["C2", 3, 55000], ["D1", 1, 24000], ["D2", 2, 36000]] },
    { name: "Westlands Court", addr: "Mpaka Road", city: "Nairobi", owner: 1, type: "BUILDING" as const, units: [["1", 2, 45000], ["2", 2, 45000], ["3", 3, 62000], ["4", 1, 30000], ["5", 1, 30000]] },
    { name: "Karen Cottages", addr: "Karen Road", city: "Nairobi", owner: 2, type: "BUILDING" as const, units: [["Cottage 1", 3, 85000], ["Cottage 2", 3, 85000], ["Cottage 3", 4, 110000]] },
    { name: "Nyali Court Apartments", addr: "Links Road", city: "Mombasa", owner: 3, type: "BUILDING" as const, units: [["1A", 2, 35000], ["1B", 1, 25000], ["2A", 3, 55000], ["2B", 2, 40000]] },
  ];
  const units: { id: string; label: string; rent: number; property: string; ownerIdx: number }[] = [];
  const propertyIds: string[] = [];
  for (const p of propSpec) {
    const prop = await db.property.create({
      data: { orgId: org.id, name: p.name, addressLine1: p.addr, city: p.city, type: p.type, managementMode: "AGENCY_MANAGED", commissionPct: 8, ownerId: owners[p.owner].id },
    });
    propertyIds.push(prop.id);
    for (const [label, beds, rent] of p.units) {
      const u = await db.unit.create({ data: { propertyId: prop.id, label: String(label), bedrooms: Number(beds), bathrooms: Number(beds) > 1 ? 2 : 1, rentAmount: Number(rent), status: "VACANT", listed: false } });
      units.push({ id: u.id, label: `${p.name} ${label}`, rent: Number(rent), property: prop.id, ownerIdx: p.owner });
    }
  }

  // ---------- Tenants, leases, six months of rent ----------
  const names = ["John Kariuki", "Mary Njeri", "David Omondi", "Esther Wambui", "Brian Mutiso", "Lucy Chebet", "Kevin Otieno", "Janet Akinyi", "Moses Kamau", "Sarah Naliaka", "Peter Mwita", "Rose Atieno", "Daniel Kimani", "Naomi Wairimu", "Paul Odhiambo", "Beatrice Mueni", "Hassan Abdi", "Tabitha Nyokabi"];
  const vacantCount = 3;
  const leased = units.slice(0, units.length - vacantCount);
  const leases: { id: string; unit: (typeof units)[number]; tenantId: string; name: string; phone: string }[] = [];
  for (let i = 0; i < leased.length; i++) {
    const u = leased[i];
    const name = names[i % names.length];
    const phone = `07${pick(["11", "22", "33", "00"])} ${String(100 + i * 7).padStart(3, "0")} ${String(200 + i * 13).padStart(3, "0")}`;
    const tenant = await db.tenant.create({
      data: { orgId: org.id, name, phone, email: `${name.toLowerCase().replace(" ", ".")}@example.com`, notifyChannel: "WHATSAPP", idNumber: String(20000000 + i * 137_211) },
    });
    const start = monthsAgo(6 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 5));
    const lease = await db.lease.create({
      data: { unitId: u.id, tenantId: tenant.id, startDate: start, rentAmount: u.rent, depositAmount: u.rent, endDate: i === 2 || i === 5 ? new Date(now.getTime() + (20 + i * 6) * DAY) : new Date(now.getTime() + 200 * DAY) },
    });
    await db.unit.update({ where: { id: u.id }, data: { status: "OCCUPIED" } });
    leases.push({ id: lease.id, unit: u, tenantId: tenant.id, name, phone });

    // History: months 5..1 ago are paid (a couple late), this month is a mix.
    for (let m = 5; m >= 0; m--) {
      const due = new Date(now.getFullYear(), now.getMonth() - m, 5);
      const method = pick(["MPESA", "MPESA", "MPESA", "BANK", "CASH"] as const);
      let status: "PAID" | "PENDING" | "LATE" = "PAID";
      if (m === 0) status = i % 4 === 0 ? "PENDING" : i % 7 === 3 ? "LATE" : due > now ? "PENDING" : "PAID";
      if (m === 1 && i % 9 === 4) status = "LATE";
      if (m === 2 && i % 11 === 5) status = "LATE";
      const paidDate = status === "PAID" ? new Date(due.getTime() + Math.floor(rnd() * 4) * DAY) : null;
      await db.payment.create({
        data: { leaseId: lease.id, amount: u.rent, dueDate: due, paidDate, status, method, reference: status === "PAID" && method !== "CASH" ? code() : null },
      });
    }
  }

  // ---------- Suppliers, repairs, invoices ----------
  const supplierSpec = [
    ["Maji Safi Plumbers", "PLUMBER", "0712 345 001", 2500],
    ["Umeme Bora Electricals", "ELECTRICIAN", "0723 345 002", 3000],
    ["Fundi Mkubwa Carpentry", "CARPENTER", "0734 345 003", 2800],
    ["Rangi Pro Painters", "PAINTER", "0701 345 004", 2200],
    ["Handy Hands General", "GENERAL", "0715 345 005", 1800],
  ] as const;
  const suppliers = [];
  for (const [name, trade, phone, rate] of supplierSpec) {
    suppliers.push(await db.supplier.create({ data: { orgId: org.id, name, trade, phone, rate, mpesaNumber: phone.replace(/\s/g, ""), payoutMethod: "MPESA", notifyChannel: "WHATSAPP" } }));
  }
  const repairSpec: [number, string, string, number | null, number | null, number | null][] = [
    [0, "Kitchen tap leaking under the sink", "OPEN", null, 4500, null],
    [3, "Water heater not working", "ASSIGNED", 1, 6000, null],
    [5, "Front door lock jammed", "IN_PROGRESS", 4, 3500, null],
    [8, "Bedroom ceiling paint peeling", "ASSIGNED", 3, 12000, null],
    [1, "Blocked bathroom drain", "DONE", 0, 3000, 3200],
    [6, "Two sockets sparking in the living room", "DONE", 1, 5000, 5400],
    [10, "Wardrobe hinge broken", "DONE", 2, 2000, 1800],
    [12, "Gate remote not opening the gate", "OPEN", null, null, null],
  ];
  const requests = [];
  for (const [idx, description, status, sup, est, actual] of repairSpec) {
    const u = leased[idx % leased.length];
    requests.push(
      await db.maintenanceRequest.create({
        data: {
          unitId: u.id, description, status: status as "OPEN", reportedBy: pick(["Tenant", "Caretaker", "Peter Otieno"]),
          supplierId: sup === null ? null : suppliers[sup].id, costEstimate: est, actualCost: actual,
          completedAt: status === "DONE" ? new Date(now.getTime() - (3 + idx) * DAY) : null,
          createdAt: new Date(now.getTime() - (2 + idx * 3) * DAY),
        },
      })
    );
  }
  const invSpec: [number, string, number, "SUBMITTED" | "APPROVED" | "PAID"][] = [
    [4, "Unblock drain and replace trap", 2800, "PAID"],
    [5, "Replace 2 sockets and rewire", 4650, "APPROVED"],
    [6, "Wardrobe hinges (6) and labour", 1550, "SUBMITTED"],
    [3, "Repaint bedroom ceiling and walls", 62000, "SUBMITTED"],
  ];
  for (const [ri, description, amount, status] of invSpec) {
    const vat = Math.round(amount * 0.16);
    await db.supplierInvoice.create({
      data: {
        orgId: org.id, supplierId: requests[ri].supplierId ?? suppliers[0].id, requestId: requests[ri].id, number: `INV-${1000 + ri}`,
        description, amount, vat, total: amount + vat, status, issueDate: new Date(now.getTime() - 6 * DAY),
        approvedAt: status !== "SUBMITTED" ? new Date(now.getTime() - 4 * DAY) : null,
        paidAt: status === "PAID" ? new Date(now.getTime() - 2 * DAY) : null, payMethod: status === "PAID" ? "MPESA" : null, payRef: status === "PAID" ? code() : null,
      },
    });
  }
  const sched = [["Fire extinguisher service", 12, 40], ["Water tank cleaning", 6, 12], ["Lift and generator service", 3, -6]] as const;
  for (let i = 0; i < sched.length; i++) {
    await db.maintenanceSchedule.create({ data: { propertyId: propertyIds[i % propertyIds.length], title: sched[i][0], intervalMonths: sched[i][1], nextDue: new Date(now.getTime() + sched[i][2] * DAY), estimatedCost: 15000 + i * 5000, supplierId: suppliers[4].id } });
  }

  // ---------- Payouts ----------
  for (let m = 2; m >= 1; m--) {
    for (let o = 0; o < owners.length; o++) {
      const gross = leases.filter((l) => l.unit.ownerIdx === o).reduce((s, l) => s + l.unit.rent, 0);
      const commission = Math.round(gross * 0.08);
      const maintenance = o === 0 && m === 1 ? 3200 : 0;
      await db.payout.create({
        data: {
          ownerId: owners[o].id, periodStart: new Date(now.getFullYear(), now.getMonth() - m, 1), periodEnd: new Date(now.getFullYear(), now.getMonth() - m + 1, 0),
          grossRent: gross, commission, maintenance, netAmount: gross - commission - maintenance,
          status: m === 2 || o < 2 ? "PAID" : "PENDING", method: m === 2 || o < 2 ? "MPESA" : null, reference: m === 2 || o < 2 ? code() : null,
          paidDate: m === 2 || o < 2 ? new Date(now.getFullYear(), now.getMonth() - m + 1, 8) : null,
        },
      });
    }
  }

  // ---------- Books (manual entries), M-Pesa proofs, utilities, staff ----------
  const ledger: [number, "IN" | "OUT", number, string, string][] = [
    [1, "OUT", 3500, "Transport", "Fuel for site visits"], [2, "OUT", 1200, "Office", "Airtime and data"], [3, "OUT", 9800, "Cleaning", "Stairwell cleaning, Kilimani"],
    [4, "IN", 15000, "Other income", "Parking bay fees, Westlands"], [5, "OUT", 2500, "Security", "Gate guard allowance"], [6, "OUT", 4200, "Taxes & fees", "Business permit top-up"],
  ];
  for (const [daysAgo, kind, amount, category, note] of ledger) {
    await db.ledgerEntry.create({ data: { orgId: org.id, kind, amount, category, note, method: "MPESA", date: new Date(now.getTime() - daysAgo * 2 * DAY), createdById: admin.id } });
  }
  // Proofs come from tenants who really are on file (same phone number), as they do in real use,
  // so the confirm screen can match them automatically.
  for (const [li, c] of [[7, "RGT4K9X2QA"], [8, "RGT7M3B8ZP"], [9, "RGU1C5D6WN"]] as const) {
    const l = leases[li];
    const digits = l.phone.replace(/\s/g, "");
    await db.paymentProof.create({
      data: {
        orgId: org.id, code: c, amount: l.unit.rent, payerName: l.name.toUpperCase(), payerPhone: digits, leaseId: l.id,
        rawMessage: `${c} Confirmed. Ksh${l.unit.rent.toLocaleString("en-US")}.00 received from ${l.name.toUpperCase()} ${digits} on ${now.getDate()}/${now.getMonth() + 1}/${String(now.getFullYear()).slice(2)} at 9:14 AM. Account ${l.unit.label}. New business balance is Ksh${(l.unit.rent * 6).toLocaleString("en-US")}.00.`,
      },
    });
  }
  const meters = [
    await db.utilityMeter.create({ data: { type: "WATER", label: "Water meter A1", rate: 180, unitName: "m3", unitId: leased[0].id } }),
    await db.utilityMeter.create({ data: { type: "WATER", label: "Water meter A2", rate: 180, unitName: "m3", unitId: leased[1].id } }),
    await db.utilityMeter.create({ data: { type: "INTERNET", label: "Fibre, flat fee", mode: "FIXED", rate: 3500, unitName: "month", unitId: leased[0].id } }),
  ];
  for (const [mi, meter] of meters.slice(0, 2).entries()) {
    let prev = 120;
    for (let m = 3; m >= 0; m--) {
      const use = 9 + Math.floor(rnd() * 6) + (mi === 1 && m === 0 ? 18 : 0);
      await db.meterReading.create({
        data: { meterId: meter.id, leaseId: leases[mi].id, readingDate: new Date(now.getFullYear(), now.getMonth() - m, 28), reading: prev + use, previousReading: prev, consumption: use, amount: use * 180, status: m > 0 ? "PAID" : "UNPAID", paidDate: m > 0 ? new Date(now.getFullYear(), now.getMonth() - m + 1, 3) : null, alert: mi === 1 && m === 0 ? "2.4x higher than usual" : null },
      });
      prev += use;
    }
  }
  for (const [name, title, basic, allow] of [["Esther Njoroge", "Caretaker, Kilimani Heights", 22000, 3000], ["Charles Mbugua", "Security supervisor", 25000, 2500], ["Dorcas Anyango", "Office assistant", 30000, 4000]] as const) {
    await db.employee.create({ data: { orgId: org.id, name, jobTitle: title, basicSalary: basic, allowances: allow, phone: "0711 000 000", payMethod: "MPESA", mpesaNumber: "0711000000", startDate: monthsAgo(14, 1) } });
  }

  // ---------- Messages and activity ----------
  const notes: [string, "EMAIL" | "SMS" | "WHATSAPP", "SENT" | "QUEUED" | "FAILED" | "SKIPPED", string, string][] = [
    ["RENT_REMINDER", "WHATSAPP", "QUEUED", "John Kariuki", "Rent due in 3 days"], ["RENT_REMINDER", "SMS", "SENT", "Mary Njeri", "Rent due today"],
    ["RENT_LATE", "SMS", "SENT", "Brian Mutiso", "Rent overdue"], ["PAYMENT_RECEIVED", "WHATSAPP", "QUEUED", "Esther Wambui", "Receipt for your rent payment"],
    ["RENT_REMINDER", "EMAIL", "FAILED", "Moses Kamau", "Rent overdue"], ["LEASE_EXPIRING", "EMAIL", "SKIPPED", "Grace Mutua", "Lease expiring soon"],
  ];
  for (const [event, channel, status, who, subject] of notes) {
    await db.notification.create({
      data: { orgId: org.id, event, channel, status, recipientName: who, recipient: channel === "EMAIL" ? "x@example.com" : "0711000111", subject, body: `${subject}. Thank you.`, error: status === "FAILED" ? "Resend 422: invalid recipient" : status === "SKIPPED" ? "No email on file" : null, sentAt: status === "SENT" ? new Date() : null, dedupeKey: `demo-${event}-${who}` },
    });
  }
  const audits: [string, string][] = [["rent.record", "Mary Njeri KES 38,000 via chat"], ["tenant.create", "Hassan Abdi via chat"], ["invoice.approved", "INV-1001 Umeme Bora Electricals"], ["books.add", "OUT KES 3,500 Fuel for site visits"], ["role.created", "Accountant"], ["payout.paid", "Grace Mutua, September"]];
  for (const [i, [action, detail]] of audits.entries()) {
    await db.auditLog.create({ data: { orgId: org.id, actorId: admin.id, actorName: i % 2 ? "Peter Otieno" : "Wanjiru Kamau", action, detail, createdAt: new Date(now.getTime() - i * 5 * 3_600_000) } });
  }

  // ---------- Online payments (sandbox values, not real) ----------
  await saveOrgSettings(db, org.id, {
    mpesaEnabled: true, mpesaEnv: "sandbox", mpesaKind: "PAYBILL", mpesaShortcode: "174379", mpesaPartyB: "",
    mpesaConsumerKey: "demo-consumer-key", mpesaConsumerSecret: "demo-consumer-secret", mpesaPasskey: "demo-passkey",
    flutterwaveEnabled: true, flutterwaveSecretKey: "FLWSECK_TEST-demo", flutterwaveHash: "demo-hash",
  });
  const l0 = leases[4];
  await db.paymentIntent.createMany({
    data: [
      { orgId: org.id, purpose: "RENT", provider: "MPESA", status: "SUCCESS", amount: l0.unit.rent, paidAmount: l0.unit.rent, receipt: code(), providerRef: "ws_CO_demo_1", leaseId: l0.id, phone: l0.phone, completedAt: new Date(now.getTime() - 2 * DAY), createdAt: new Date(now.getTime() - 2 * DAY) },
      { orgId: org.id, purpose: "RENT", provider: "FLUTTERWAVE", status: "PENDING", amount: leases[6].unit.rent, providerRef: "pi_demo_2", checkoutUrl: "https://checkout.flutterwave.com/v3/hosted/pay/demo", leaseId: leases[6].id },
      { orgId: org.id, purpose: "RENT", provider: "MPESA", status: "FAILED", amount: leases[8].unit.rent, failureReason: "Request cancelled by user", providerRef: "ws_CO_demo_3", leaseId: leases[8].id, phone: leases[8].phone, completedAt: new Date(now.getTime() - 5 * DAY), createdAt: new Date(now.getTime() - 5 * DAY) },
    ],
  });

  // ---------- Other customer companies (for the PropCo admin console) ----------
  const others: [string, "FREE" | "GROWTH" | "PRO", number, number | null, boolean][] = [
    ["Pwani Homes Ltd", "PRO", -300, 12, false], ["Savanna Rentals", "GROWTH", -90, 3, false], ["Lakeview Estates", "GROWTH", -120, -6, false],
    ["Upendo Landlords", "FREE", 9, null, false], ["Zawadi Apartments", "FREE", 2, null, false], ["Ridgeway Management", "PRO", -400, 20, true],
  ];
  for (const [i, [name, plan, trialOffset, paidOffset, suspended]] of others.entries()) {
    const o = await db.organization.create({
      data: { name, plan, trialEndsAt: new Date(now.getTime() + (trialOffset > 0 ? trialOffset : trialOffset) * DAY), paidUntil: paidOffset === null ? null : new Date(now.getTime() + paidOffset * DAY), createdAt: new Date(now.getTime() - (20 + i * 25) * DAY), suspendedAt: suspended ? now : null, suspendedReason: suspended ? "Chargeback dispute" : null },
    });
    await db.user.create({ data: { orgId: o.id, email: `admin@${name.toLowerCase().replace(/[^a-z]/g, "")}.example`, name: `${name.split(" ")[0]} Admin`, role: "ADMIN", passwordHash: hash, lastLoginAt: new Date(now.getTime() - (i % 3 === 2 ? 20 : i) * DAY) } });
  }
  for (const [name, at] of [["worker", 0], ["daily-job", 4 * 3_600_000], ["payments-reconcile", 60_000]] as const) {
    await db.systemHeartbeat.create({ data: { name, seenAt: new Date(now.getTime() - at - 20_000) } });
  }
  await db.supportNote.create({ data: { orgId: (await db.organization.findFirstOrThrow({ where: { name: "Lakeview Estates" } })).id, authorEmail: DEMO.operator, body: "Called on Monday. Plan lapsed after their M-Pesa till changed. Promised to pay this week." } });

  console.log("Demo company seeded.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
