import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PERMISSION_LABEL, ROLE_DEFAULTS } from "@/lib/permissions";
import { updateMember, setMemberActive, resetMemberPassword, removeMember } from "../actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const user = await requirePermission("team.manage");

  const [m, roles] = await Promise.all([
    prisma.user.findFirst({
      where: { id, orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } },
      include: { orgRole: true },
    }),
    prisma.orgRole.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
  ]);
  if (!m) notFound();

  const self = m.id === user.id;
  const perms = m.orgRole ? m.orgRole.permissions : ROLE_DEFAULTS[m.role];
  const current = m.orgRole ? `custom:${m.orgRole.id}` : m.role;

  return (
    <div className="max-w-2xl">
      <Link href="/team" className="text-sm text-muted hover:underline">
        ← Team and access
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">{m.name ?? m.email}</h1>
      <p className="mt-1 text-sm text-muted">
        {m.email} · last sign-in {m.lastLoginAt ? m.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "never"}
        {m.active ? "" : " · suspended"}
      </p>

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {ok && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">{ok}</p>}

      <form action={updateMember.bind(null, m.id)} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Role</h2>
        <select name="role" defaultValue={current} disabled={self} className={input}>
          <option value="ADMIN">Admin</option>
          <option value="STAFF">Staff</option>
          {roles.map((r) => (
            <option key={r.id} value={`custom:${r.id}`}>
              {r.name} (custom)
            </option>
          ))}
        </select>
        {self ? (
          <p className="text-xs text-muted">You can&apos;t change your own role. Ask another admin.</p>
        ) : (
          <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save role</button>
        )}
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">What this person can do</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {perms.map((p) => (
              <li key={p} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                {PERMISSION_LABEL[p] ?? p}
              </li>
            ))}
          </ul>
        </div>
      </form>

      {!self && (
        <>
          <form action={resetMemberPassword.bind(null, m.id)} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <h2 className="font-serif text-lg text-ink">Reset password</h2>
            <p className="text-xs text-muted">Sets a temporary password. They must choose a new one when they next sign in. Also clears any lock.</p>
            <div className="flex flex-wrap gap-2">
              <input name="password" type="text" minLength={8} placeholder="Temporary password" required className={`${input} w-64`} />
              <button className="rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink">Reset</button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface p-5 text-sm">
            <form action={setMemberActive.bind(null, m.id, !m.active)}>
              <button className={`font-medium hover:underline ${m.active ? "text-danger" : "text-accent"}`}>
                {m.active ? "Suspend access" : "Restore access"}
              </button>
              <p className="mt-1 text-xs text-muted">
                {m.active ? "They are signed out and can't get back in." : "They can sign in again."}
              </p>
            </form>
            <form action={removeMember.bind(null, m.id)}>
              <button className="font-medium text-danger hover:underline">Remove from team</button>
              <p className="mt-1 text-xs text-muted">Permanently deletes this sign-in.</p>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
