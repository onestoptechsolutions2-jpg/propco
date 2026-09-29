import { requireUser } from "@/lib/access";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppNav, type NavGroup } from "@/components/AppNav";
import { PwaSetup } from "@/components/PwaSetup";
import Link from "next/link";
import { PLANS, isPlatformAdmin, orgStatus } from "@/lib/plans";
import type { Role } from "@prisma/client";

type Item = { href: string; label: string; hint?: string; roles?: Role[] };
type Group = { title?: string; items: Item[] };

const STAFF: Role[] = ["ADMIN", "STAFF"];
const MANAGERS: Role[] = ["ADMIN", "STAFF", "LANDLORD"];

// Plain-language labels, grouped by what the person is trying to do.
// Omit `roles` for "everyone signed in".
const NAV: Group[] = [
  {
    items: [
      { href: "/dashboard", label: "Home" },
      { href: "/guide", label: "Step-by-step guides", hint: "Not sure where to start?" },
    ],
  },
  {
    title: "My portfolio",
    items: [
      { href: "/properties", label: "Properties & units" },
      { href: "/owners", label: "Owners", roles: STAFF },
      { href: "/tenants", label: "Tenants", roles: MANAGERS },
      { href: "/leases", label: "Move in & out", hint: "Onboarding and clearing a unit", roles: MANAGERS },
    ],
  },
  {
    title: "Money in",
    items: [
      { href: "/rent", label: "Collect rent", roles: MANAGERS },
      { href: "/rent/confirm", label: "Confirm M-Pesa", hint: "Tenants share proof of payment", roles: MANAGERS },
      { href: "/utilities", label: "Water, power & internet", roles: MANAGERS },
    ],
  },
  {
    title: "Money out",
    items: [
      // Landlords collect their own rent, so agency payouts don't apply to them.
      { href: "/payouts", label: "Owner payouts", roles: ["ADMIN", "STAFF", "OWNER"] },
      { href: "/supplier-payments", label: "Pay suppliers", roles: STAFF },
    ],
  },
  {
    title: "Repairs",
    items: [
      { href: "/maintenance", label: "Repair requests" },
      { href: "/suppliers", label: "Suppliers", roles: MANAGERS },
    ],
  },
  {
    title: "Communication",
    items: [{ href: "/notifications", label: "Messages", roles: STAFF }],
  },
  {
    title: "Account",
    items: [
      { href: "/team", label: "My team", roles: ["ADMIN"] },
      { href: "/billing", label: "Plan & billing", roles: ["ADMIN"] },
    ],
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isStaff = user.role === "ADMIN" || user.role === "STAFF";

  // WhatsApp messages waiting for a person to tap "Send".
  const proofsWaiting = await prisma.paymentProof.count({ where: { orgId: user.orgId, status: "PENDING" } });
  const whatsappWaiting = isStaff
    ? await prisma.notification.count({ where: { orgId: user.orgId, channel: "WHATSAPP", status: "QUEUED" } })
    : 0;

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const status = orgStatus(org);
  const unitCount = await prisma.unit.count({ where: { property: { orgId: org.id } } });
  const overLimit = status.maxUnits !== Infinity && unitCount >= status.maxUnits;

  const nav: Group[] = isPlatformAdmin(user.email)
    ? [...NAV, { title: "Platform", items: [{ href: "/platform", label: "All companies" }] }]
    : NAV;

  const groups: NavGroup[] = nav.map((g) => ({
    title: g.title,
    items: g.items
      .filter((i) => !i.roles || i.roles.includes(user.role))
      .map(({ href, label, hint }) => ({
        href,
        label,
        hint,
        badge:
          href === "/notifications" ? whatsappWaiting : href === "/rent/confirm" ? proofsWaiting : undefined,
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
        userLabel={user.name ?? user.email ?? ""}
        roleLabel={user.role.toLowerCase()}
        signOutAction={doSignOut}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10 print:p-0">
        <PwaSetup />
        {user.role === "ADMIN" && (status.inTrial || overLimit || status.lapsed) && (
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
