import { requireUser } from "@/lib/access";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppNav, type NavGroup, type QuickItem } from "@/components/AppNav";
import { PwaSetup } from "@/components/PwaSetup";
import Link from "next/link";
import { PLANS, isPlatformAdmin, orgStatus } from "@/lib/plans";
type Item = { href: string; label: string; hint?: string; perm?: string };
type Group = { title?: string; items: Item[] };

// Plain-language labels, grouped by what the person is trying to do.
// `perm` is the permission needed to see the item (see src/lib/permissions.ts);
// omit it for "everyone signed in".
const NAV: Group[] = [
  {
    items: [
      { href: "/dashboard", label: "Home" },
      { href: "/insights", label: "Insights", hint: "How you are performing" },
      { href: "/guide", label: "Step-by-step guides", hint: "Not sure where to start?" },
    ],
  },
  {
    title: "My portfolio",
    items: [
      { href: "/properties", label: "Properties & units" },
      { href: "/owners", label: "Owners", perm: "owners.manage" },
      { href: "/tenants", label: "Tenants", perm: "tenants.manage" },
      { href: "/leases", label: "Move in & out", hint: "Onboarding and clearing a unit", perm: "leases.manage" },
    ],
  },
  {
    title: "Vacancies & stays",
    items: [
      { href: "/listings", label: "Vacancy pages", hint: "Fill empty units faster", perm: "listings.manage" },
      { href: "/stays", label: "Short stays", hint: "Homestay / BnB bookings", perm: "stays.manage" },
      { href: "/access", label: "Door codes", hint: "Smart lock and keypad codes", perm: "access.manage" },
    ],
  },
  {
    title: "Money in",
    items: [
      { href: "/rent", label: "Collect rent", perm: "rent.manage" },
      { href: "/rent/confirm", label: "Confirm M-Pesa", hint: "Tenants share proof of payment", perm: "rent.manage" },
      { href: "/utilities", label: "Water, power & internet", perm: "utilities.manage" },
    ],
  },
  {
    title: "Money out",
    items: [
      { href: "/payouts", label: "Owner payouts", perm: "payouts.view" },
      { href: "/invoices", label: "Supplier invoices", hint: "Approve, then pay", perm: "invoices.manage" },
      { href: "/supplier-payments", label: "Pay suppliers", perm: "supplier_payments.manage" },
    ],
  },
  {
    title: "Repairs",
    items: [
      { href: "/maintenance", label: "Repair requests" },
      { href: "/maintenance/schedule", label: "Preventive calendar", hint: "Recurring jobs", perm: "maintenance.manage" },
      { href: "/suppliers", label: "Suppliers", perm: "suppliers.manage" },
      { href: "/services", label: "Services & insurance", hint: "Trusted providers", perm: "services.view" },
    ],
  },
  {
    title: "Communication",
    items: [{ href: "/notifications", label: "Messages", perm: "messages.manage" }],
  },
  {
    title: "Account",
    items: [
      { href: "/payroll", label: "Payroll", hint: "Salaries and payslips", perm: "payroll.manage" },
      { href: "/team", label: "Team & roles", hint: "People, access and activity", perm: "team.manage" },
      { href: "/billing", label: "Plan & billing", perm: "billing.manage" },
      { href: "/account", label: "My account", hint: "Password and sign-in" },
    ],
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const canRent = user.can("rent.manage");
  const canMessages = user.can("messages.manage");

  // WhatsApp messages waiting for a person to tap "Send".
  const jobsOverdue =
    user.role === "OWNER"
      ? 0
      : await prisma.maintenanceSchedule.count({
          where: {
            active: true,
            nextDue: { lt: new Date() },
            property: user.role === "LANDLORD" ? { orgId: user.orgId, ownerId: user.ownerId ?? "__none__" } : { orgId: user.orgId },
          },
        });
  const proofsWaiting = canRent
    ? await prisma.paymentProof.count({ where: { orgId: user.orgId, status: "PENDING" } })
    : 0;
  const whatsappWaiting = canMessages
    ? await prisma.notification.count({ where: { orgId: user.orgId, channel: "WHATSAPP", status: "QUEUED" } })
    : 0;

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const status = orgStatus(org);
  const unitCount = await prisma.unit.count({ where: { property: { orgId: org.id } } });
  const overLimit = status.maxUnits !== Infinity && unitCount >= status.maxUnits;

  const nav: Group[] = isPlatformAdmin(user.email)
    ? [...NAV, { title: "Platform", items: [{ href: "/platform", label: "All companies" }, { href: "/platform/partners", label: "Service partners" }] }]
    : NAV;

  // Phone bottom bar: four big buttons for the daily jobs, plus "More" for the rest.
  const quick: QuickItem[] =
    user.role === "OWNER"
      ? [
          { href: "/dashboard", label: "Home", icon: "home" },
          { href: "/properties", label: "Properties", icon: "building" },
          { href: "/payouts", label: "Payouts", icon: "wallet" },
          { href: "/maintenance", label: "Repairs", icon: "wrench" },
        ]
      : [
          { href: "/dashboard", label: "Home", icon: "home" },
          ...(canRent ? [{ href: "/rent", label: "Rent", icon: "cash" as const, badge: proofsWaiting }] : []),
          { href: "/maintenance", label: "Repairs", icon: "wrench" },
          ...(canMessages
            ? [{ href: "/notifications", label: "Messages", icon: "chat" as const, badge: whatsappWaiting }]
            : user.can("tenants.manage")
              ? [{ href: "/tenants", label: "Tenants", icon: "users" as const }]
              : []),
        ];

  const groups: NavGroup[] = nav.map((g) => ({
    title: g.title,
    items: g.items
      .filter((i) => !i.perm || user.can(i.perm))
      .map(({ href, label, hint }) => ({
        href,
        label,
        hint,
        badge:
          href === "/notifications"
            ? whatsappWaiting
            : href === "/rent/confirm"
              ? proofsWaiting
              : href === "/maintenance/schedule"
                ? jobsOverdue
                : undefined,
      })),
  })).filter((g) => g.items.length > 0);

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen md:flex">
      <AppNav
        groups={groups}
        quick={quick}
        userLabel={user.name ?? user.email ?? ""}
        roleLabel={user.roleName.toLowerCase()}
        signOutAction={doSignOut}
      />
      {/* pb-28 on phones keeps the last content clear of the fixed bottom bar */}
      <main className="min-w-0 flex-1 px-4 py-6 pb-28 sm:px-6 sm:py-8 md:px-10 md:py-10 md:pb-10 print:p-0">
        <PwaSetup />
        {user.can("billing.manage") && (status.inTrial || overLimit || status.lapsed) && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-accent-light px-4 py-3 text-sm text-ink print:hidden">
            <p>
              {status.inTrial
                ? `Free trial: ${status.trialDaysLeft} day${status.trialDaysLeft === 1 ? "" : "s"} left. After that, the free plan covers ${PLANS.FREE.maxUnits} units.`
                : status.lapsed
                  ? "Your paid plan has expired, so the free 5-unit limit applies."
                  : `You've reached your plan's limit of ${status.maxUnits} units.`}
            </p>
            <Link href="/billing" className="rounded bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-ink-light">
              {status.inTrial ? "Choose a plan" : "Upgrade"}
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
