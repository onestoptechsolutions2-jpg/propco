import { requireUser } from "@/lib/access";
import { signOut } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import type { Role } from "@prisma/client";

// Which roles see each nav item. Omit `roles` for "everyone signed in".
const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/properties", label: "Properties" },
  { href: "/rent", label: "Rent", roles: ["ADMIN", "STAFF", "LANDLORD"] },
  // Landlords collect their own rent, so agency payouts don't apply to them.
  { href: "/payouts", label: "Payouts", roles: ["ADMIN", "STAFF", "OWNER"] },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/supplier-payments", label: "Supplier pay", roles: ["ADMIN", "STAFF"] },
  { href: "/suppliers", label: "Suppliers", roles: ["ADMIN", "STAFF", "LANDLORD"] },
  { href: "/notifications", label: "Notifications", roles: ["ADMIN", "STAFF"] },
  { href: "/owners", label: "Owners", roles: ["ADMIN", "STAFF"] },
  { href: "/tenants", label: "Tenants", roles: ["ADMIN", "STAFF", "LANDLORD"] },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role)).map(
    ({ href, label }) => ({ href, label })
  );

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen md:flex">
      <AppNav
        items={items}
        userLabel={user.name ?? user.email ?? ""}
        roleLabel={user.role.toLowerCase()}
        signOutAction={doSignOut}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
