import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["STAFF", "ADMIN"]),
});

async function addMember(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) redirect(`/team?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const { name, email, password, role } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    redirect(`/team?error=${encodeURIComponent("That email already has an account.")}`);
  }
  await prisma.user.create({
    data: { name, email, role, orgId: user.orgId, passwordHash: await bcrypt.hash(password, 10) },
  });
  revalidatePath("/team");
  redirect("/team?added=1");
}

async function saveCompany(formData: FormData) {
  "use server";
  const user = await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) redirect("/team");
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      name,
      payInstructions: String(formData.get("payInstructions") ?? "").trim().slice(0, 500) || null,
    },
  });
  revalidatePath("/team");
  redirect("/team?saved=1");
}

async function removeMember(userId: string) {
  "use server";
  const user = await requireRole("ADMIN");
  if (userId === user.id) throw new Error("You can't remove yourself.");
  await prisma.user.deleteMany({ where: { id: userId, orgId: user.orgId, role: { in: ["STAFF", "ADMIN"] } } });
  revalidatePath("/team");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string; saved?: string }>;
}) {
  const user = await requireRole("ADMIN");
  const { error, added, saved } = await searchParams;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const members = await prisma.user.findMany({
    where: { orgId: user.orgId, role: { in: ["ADMIN", "STAFF"] } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-ink">Your team</h1>
      <p className="mt-1 text-sm text-muted">
        Add colleagues so they can sign in and help. Give them the email and password you set here.
      </p>

      <form action={saveCompany} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Company details</h2>
        <p className="text-xs text-muted">Shown at the top of receipts, invoices and statements.</p>
        <input name="name" defaultValue={org.name} required className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink" />
        <textarea
          name="payInstructions"
          rows={3}
          defaultValue={org.payInstructions ?? ""}
          placeholder="How tenants should pay, e.g. M-Pesa Paybill 123456, account: your unit number"
          className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
          Save company details
        </button>
        {saved && <p className="text-xs text-accent">Saved.</p>}
      </form>

      {error && (
        <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {added && (
        <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">
          Team member added. Share their sign-in details with them.
        </p>
      )}

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium text-foreground">{m.name ?? m.email}</p>
              <p className="text-xs text-muted">
                {m.email} · {m.role === "ADMIN" ? "Admin" : "Staff"}
              </p>
            </div>
            {m.id !== user.id && (
              <form action={removeMember.bind(null, m.id)}>
                <button className="text-xs text-danger hover:underline">Remove</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-serif text-xl text-ink">Add a team member</h2>
      <form action={addMember} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <input name="name" placeholder="Full name" required className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink" />
        <input name="email" type="email" placeholder="Email" required className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink" />
        <input name="password" type="text" minLength={8} placeholder="Temporary password (8+ characters)" required className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink" />
        <select name="role" defaultValue="STAFF" className="rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink">
          <option value="STAFF">Staff — can manage day to day work</option>
          <option value="ADMIN">Admin — can also manage billing and the team</option>
        </select>
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
          Add team member
        </button>
      </form>
    </div>
  );
}
