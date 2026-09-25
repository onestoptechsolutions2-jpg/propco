import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();
  const propertyFilter = ownerScopeFilter(user);

  const [propertyCount, unitCount, occupiedCount, tenantCount] = await Promise.all([
    prisma.property.count({ where: propertyFilter }),
    prisma.unit.count({ where: { property: propertyFilter } }),
    prisma.unit.count({ where: { property: propertyFilter, status: "OCCUPIED" } }),
    user.role === "ADMIN" || user.role === "STAFF"
      ? prisma.tenant.count()
      : Promise.resolve(null),
  ]);

  const cards = [
    { label: "Properties", value: propertyCount, href: "/properties" },
    { label: "Units", value: unitCount, href: "/properties" },
    {
      label: "Occupied",
      value: unitCount ? `${occupiedCount}/${unitCount}` : "0/0",
      href: "/properties",
    },
    ...(tenantCount !== null
      ? [{ label: "Tenants", value: tenantCount, href: "/tenants" }]
      : []),
  ];

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink">
        Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {user.role === "OWNER"
          ? "Here's how your properties are doing."
          : "Here's what's happening across the portfolio."}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-border bg-surface p-5 transition hover:border-ink"
          >
            <p className="text-xs uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 font-serif text-3xl text-ink">{card.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-border bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">Get started</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
          {(user.role === "ADMIN" || user.role === "STAFF") && (
            <>
              <li>
                <Link href="/owners/new" className="text-accent hover:underline">
                  Add an owner
                </Link>{" "}
                — every property needs one on file first.
              </li>
              <li>
                <Link href="/properties/new" className="text-accent hover:underline">
                  Add a property
                </Link>{" "}
                — a single unit or a whole building.
              </li>
            </>
          )}
          {user.role === "LANDLORD" && (
            <li>
              <Link href="/properties/new" className="text-accent hover:underline">
                Add a property
              </Link>{" "}
              to your own portfolio.
            </li>
          )}
          <li>
            <Link href="/properties" className="text-accent hover:underline">
              View all properties
            </Link>{" "}
            and their units.
          </li>
        </ul>
      </div>
    </div>
  );
}
