import { requireUser } from "@/lib/access";
import { signOut } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/properties", label: "Properties" },
  { href: "/rent", label: "Rent", staffOnly: true },
  { href: "/owners", label: "Owners", staffOnly: true },
  { href: "/tenants", label: "Tenants", staffOnly: true },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isStaffLike = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LANDLORD";

  const items = NAV.filter((item) => !item.staffOnly || isStaffLike);

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
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
