import Link from "next/link";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function OwnersPage() {
  await requireRole("STAFF");

  const owners = await prisma.owner.findMany({
    include: { properties: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Owners</h1>
          <p className="mt-1 text-sm text-muted">
            {owners.length} {owners.length === 1 ? "owner" : "owners"} on file
          </p>
        </div>
        <Link
          href="/owners/new"
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Add owner
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-background text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Properties</th>
              <th className="px-4 py-3">Mode</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((owner) => (
              <tr key={owner.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/owners/${owner.id}`} className="font-medium text-ink hover:underline">
                    {owner.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{owner.email || owner.phone || "—"}</td>
                <td className="px-4 py-3 text-foreground">{owner.properties.length}</td>
                <td className="px-4 py-3 text-foreground">
                  {owner.isSelfManaging ? "Self-managing" : "Agency-managed"}
                </td>
              </tr>
            ))}
            {owners.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                  No owners yet.{" "}
                  <Link href="/owners/new" className="text-accent hover:underline">
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
