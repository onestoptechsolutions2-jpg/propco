import Link from "next/link";
import { requireUser } from "@/lib/access";
import { signOut } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/properties", label: "Properties" },
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

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-border bg-ink text-white md:w-60 md:flex-shrink-0 md:flex md:flex-col">
        <div className="px-6 py-5">
          <span className="font-serif text-xl tracking-tight">PropCo</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.filter((item) => !item.staffOnly || isStaffLike).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-6 py-4 text-xs text-white/60">
          <p className="text-white/90">{user.name ?? user.email}</p>
          <p className="mt-0.5 uppercase tracking-wide">{user.role.toLowerCase()}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="mt-3 text-white/60 underline-offset-2 hover:text-white hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
