import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PermissionPicker } from "@/components/PermissionPicker";
import { updateRole, deleteRole } from "../../actions";

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function EditRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const user = await requirePermission("team.manage");
  const role = await prisma.orgRole.findFirst({
    where: { id, orgId: user.orgId },
    include: { users: { select: { id: true, name: true, email: true } } },
  });
  if (!role) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/team/roles" className="text-sm text-muted hover:underline">
        ← Roles
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">{role.name}</h1>

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {ok && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">{ok}</p>}

      <form action={updateRole.bind(null, role.id)} className="mt-6 flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <input name="name" defaultValue={role.name} required className={input} />
        <input name="description" defaultValue={role.description ?? ""} placeholder="What this role is for (optional)" className={input} />
        <PermissionPicker selected={role.permissions} canGrant={(p) => user.role === "ADMIN" || user.can(p)} />
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save role</button>
      </form>

      <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm">
        <p className="font-medium text-foreground">People with this role ({role.users.length})</p>
        <ul className="mt-2 text-muted">
          {role.users.map((u) => (
            <li key={u.id}>
              <Link href={`/team/${u.id}`} className="text-accent hover:underline">
                {u.name ?? u.email}
              </Link>
            </li>
          ))}
          {role.users.length === 0 && <li>Nobody yet.</li>}
        </ul>
        <form action={deleteRole.bind(null, role.id)} className="mt-4">
          <button className="text-sm font-medium text-danger hover:underline">Delete this role</button>
          <p className="mt-1 text-xs text-muted">Only possible when nobody has it.</p>
        </form>
      </div>
    </div>
  );
}
