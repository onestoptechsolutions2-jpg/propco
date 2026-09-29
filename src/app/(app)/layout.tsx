import { requireUser } from "@/lib/access";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppNav, type NavGroup } from "@/components/AppNav";
import { PwaSetup } from "@/components/PwaSetup";
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
    ],
  },
  {
    title: "Money in",
    items: [{ href: "/rent", label: "Collect rent", roles: MANAGERS }],
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
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isStaff = user.role === "ADMIN" || user.role === "STAFF";

  // WhatsApp messages waiting for a person to tap "Send".
  const whatsappWaiting = isStaff
    ? await prisma.notification.count({ where: { channel: "WHATSAPP", status: "QUEUED" } })
    : 0;

  const groups: NavGroup[] = NAV.map((g) => ({
    title: g.title,
    items: g.items
      .filter((i) => !i.roles || i.roles.includes(user.role))
      .map(({ href, label, hint }) => ({
        href,
        label,
        hint,
        badge: href === "/notifications" ? whatsappWaiting : undefined,
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
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
        <PwaSetup />
        {children}
      </main>
    </div>
  );
}
