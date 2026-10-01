import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PERMISSION_LABEL, ROLE_DEFAULTS, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { TeamTabs } from "@/components/TeamTabs";
import { PermissionPicker } from "@/components/PermissionPicker";
import { createRole } from "../actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requirePermission("team.manage");
  const { error, ok } = await searchParams;
  const roles = await prisma.orgRole.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Team and access</h1>
      <TeamTabs active="roles" />

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {ok && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">{ok}</p>}

      <h2 className="mt-6 font-serif text-xl text-ink">Built-in roles</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {(["ADMIN", "STAFF"] as const).map((r) => (
          <li key={r} className="rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="font-medium text-foreground">{ROLE_LABEL[r]}</p>
            <p className="mt-0.5 text-xs text-muted">{ROLE_DESCRIPTION[r]}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-accent">See permissions ({ROLE_DEFAULTS[r].length})</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {ROLE_DEFAULTS[r].map((p) => (
                  <li key={p} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs">
                    {PERMISSION_LABEL[p]}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-serif text-xl text-ink">Your custom roles</h2>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
        {roles.map((r) => (
          <li key={r.id}>
            <Link href={`/team/roles/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-background">
              <div>
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted">{r.description ?? `${r.permissions.length} permissions`}</p>
              </div>
              <span className="text-xs text-muted">
                {r._count.users} {r._count.users === 1 ? "person" : "people"}
              </span>
            </Link>
          </li>
        ))}
        {roles.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            No custom roles yet. Make one for an accountant, caretaker, receptionist or anyone who needs less than Staff.
          </li>
        )}
      </ul>

      <h2 className="mt-8 font-serif text-xl text-ink">Create a role</h2>
      <form action={createRole} className="mt-3 flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <input name="name" required placeholder="Role name, e.g. Accountant" className={input} />
        <input name="description" placeholder="What this role is for (optional)" className={input} />
        <PermissionPicker canGrant={(p) => user.role === "ADMIN" || user.can(p)} />
        <p className="text-xs text-muted">
          People with a custom role see and do only what you tick. Everyone can still see the repairs list, properties
          and insights for the properties they are allowed to view.
        </p>
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Create role</button>
      </form>
    </div>
  );
}
