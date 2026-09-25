import Link from "next/link";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function TenantsPage() {
  await requireRole("STAFF", "LANDLORD");

  const tenants = await prisma.tenant.findMany({
    include: { leases: { where: { status: "ACTIVE" }, include: { unit: { include: { property: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Tenants</h1>
          <p className="mt-1 text-sm text-muted">
            {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"} on file
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/tenants/new"
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            Add tenant
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Current unit</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const lease = tenant.leases[0];
              return (
                <tr key={tenant.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/tenants/${tenant.id}/edit`} className="font-medium text-ink hover:underline">
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">{tenant.email || tenant.phone || "—"}</td>
                  <td className="px-4 py-3 text-foreground">
                    {lease ? (
                      <Link href={`/properties/${lease.unit.property.id}`} className="text-accent hover:underline">
                        {lease.unit.property.name} · {lease.unit.label}
                      </Link>
                    ) : (
                      <span className="text-muted">Not leased</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">
                  No tenants yet.{" "}
                  <Link href="/tenants/new" className="text-accent hover:underline">
                    Add one
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
