import Link from "next/link";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const TRADE_LABEL: Record<string, string> = {
  PLUMBER: "Plumber",
  ELECTRICIAN: "Electrician",
  CARPENTER: "Carpenter",
  PAINTER: "Painter",
  GENERAL: "General",
  OTHER: "Other",
};

export default async function SuppliersPage() {
  await requireRole("STAFF", "LANDLORD");

  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { requests: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Suppliers</h1>
          <p className="mt-1 text-sm text-muted">
            {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"} on file
          </p>
        </div>
        <Link
          href="/suppliers/new"
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Add supplier
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      href={`/suppliers/${supplier.id}/edit`}
                      className="font-medium text-ink hover:underline"
                    >
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">{TRADE_LABEL[supplier.trade]}</td>
                  <td className="px-4 py-3 text-foreground">
                    {supplier.phone || supplier.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground">{supplier._count.requests}</td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                    No suppliers yet.{" "}
                    <Link href="/suppliers/new" className="text-accent hover:underline">
                      Add one
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
