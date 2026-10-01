import Link from "next/link";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PERMISSION_LABEL } from "@/lib/permissions";

export default async function AccountPage() {
  const user = await requireUser();
  const [db, org] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id! }, select: { lastLoginAt: true, createdAt: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: user.orgId }, select: { name: true } }),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl text-ink">My account</h1>

      <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm">
        <p className="font-medium text-foreground">{user.name ?? user.email}</p>
        <p className="text-muted">{user.email}</p>
        <p className="mt-3 text-xs text-muted">
          Company: {org.name} · Role: {user.roleName}
          {db.lastLoginAt ? ` · last sign-in ${db.lastLoginAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}
        </p>
        <Link href="/account/password" className="mt-4 inline-block rounded border border-border px-4 py-2 text-sm font-medium hover:border-ink">
          Change password
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">What you can do</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {user.perms.map((p) => (
            <li key={p} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs">
              {PERMISSION_LABEL[p] ?? p}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">If you need access to something else, ask your company admin.</p>
      </div>
    </div>
  );
}
