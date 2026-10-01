import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { TeamTabs } from "@/components/TeamTabs";
import { addMember } from "./actions";

async function saveCompany(formData: FormData) {
  "use server";
  const user = await requirePermission("team.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) redirect("/team");
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      name,
      payInstructions: String(formData.get("payInstructions") ?? "").trim().slice(0, 500) || null,
      approvalLimit: Number(formData.get("approvalLimit")) > 0 ? Number(formData.get("approvalLimit")) : null,
    },
  });
  await audit(user, "company.updated", name);
  revalidatePath("/team");
  redirect("/team?ok=" + encodeURIComponent("Company details saved."));
}

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requirePermission("team.manage");
  const { error, ok } = await searchParams;

  const [org, members, roles] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } }),
    prisma.user.findMany({
      where: { orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } },
      include: { orgRole: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.orgRole.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Team and access</h1>
      <p className="mt-1 text-sm text-muted">Who can sign in to {org.name}, and what each person is allowed to do.</p>
      <TeamTabs active="people" />

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {ok && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">{ok}</p>}

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {members.map((m) => (
          <li key={m.id}>
            <Link href={`/team/${m.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-background">
              <div className="min-w-0">
                <p className={`font-medium ${m.active ? "text-foreground" : "text-muted line-through"}`}>
                  {m.name ?? m.email}
                  {m.id === user.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {m.email} · last sign-in {m.lastLoginAt ? m.lastLoginAt.toISOString().slice(0, 10) : "never"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {!m.active && <span className="rounded-full bg-danger/10 px-2 py-1 font-medium text-danger">Suspended</span>}
                {m.mustChangePassword && <span className="rounded-full bg-accent-light px-2 py-1 font-medium text-accent">Password not set</span>}
                <span className="rounded-full bg-background px-2 py-1 font-medium text-ink">
                  {m.orgRole?.name ?? (m.role === "ADMIN" ? "Admin" : "Staff")}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-serif text-xl text-ink">Add a team member</h2>
      <form action={addMember} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <input name="name" placeholder="Full name" required className={input} />
        <input name="email" type="email" placeholder="Email" required className={input} />
        <input name="password" type="text" minLength={8} placeholder="Temporary password (8+ characters)" required className={input} />
        <select name="role" defaultValue="STAFF" className={input}>
          {user.role === "ADMIN" && <option value="ADMIN">Admin: full access, including billing, payroll and team</option>}
          <option value="STAFF">Staff: day-to-day work, no payroll, billing or team</option>
          {roles.map((r) => (
            <option key={r.id} value={`custom:${r.id}`}>
              {r.name}: custom role
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          They sign in with this password and are asked to choose their own straight away.{" "}
          <Link href="/team/roles" className="text-accent hover:underline">
            Create a custom role
          </Link>{" "}
          for jobs like accountant or caretaker.
        </p>
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Add team member</button>
      </form>

      <form action={saveCompany} className="mt-10 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Company details</h2>
        <p className="text-xs text-muted">Shown at the top of receipts, invoices and statements.</p>
        <input name="name" defaultValue={org.name} required className={input} />
        <textarea
          name="payInstructions"
          rows={3}
          defaultValue={org.payInstructions ?? ""}
          placeholder="How tenants should pay, e.g. M-Pesa Paybill 123456, account: your unit number"
          className={input}
        />
        <div>
          <label className="mb-1 block text-xs text-muted">
            Supplier invoices above this amount (KES) need someone with the approval permission. Leave empty for no limit.
          </label>
          <input name="approvalLimit" type="number" min={0} defaultValue={org.approvalLimit ? Number(org.approvalLimit) : undefined} className={`${input} w-48`} />
        </div>
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save company details</button>
      </form>
    </div>
  );
}
