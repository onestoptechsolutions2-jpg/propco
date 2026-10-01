import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

async function changePassword(formData: FormData) {
  "use server";
  const user = await requireUser({ allowPasswordChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fail = (m: string): never => redirect(`/account/password?error=${encodeURIComponent(m)}`);

  const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id! } });
  // People who only ever signed in with Google have no password yet; everyone else must prove the current one.
  if (db.passwordHash && !(await bcrypt.compare(current, db.passwordHash))) fail("Your current password is not right.");
  if (next.length < 8) fail("The new password must be at least 8 characters.");
  if (next !== confirm) fail("The two new passwords don't match.");
  if (db.passwordHash && (await bcrypt.compare(next, db.passwordHash))) fail("Choose a password you haven't used just now.");

  await prisma.user.update({
    where: { id: db.id },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });
  await audit(user, "password.changed", user.email ?? undefined);
  redirect("/dashboard");
}

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; required?: string }> }) {
  const user = await requireUser({ allowPasswordChange: true });
  const { error, required } = await searchParams;
  const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id! }, select: { passwordHash: true } });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="font-serif text-2xl text-ink">{required ? "Choose your own password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-muted">
          {required ? "You were given a temporary password. Pick one only you know to continue." : "Use at least 8 characters."}
        </p>
        {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
        <form action={changePassword} className="mt-6 flex flex-col gap-3">
          {db.passwordHash && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">{required ? "Temporary password" : "Current password"}</label>
              <input name="current" type="password" required className={input} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">New password</label>
            <input name="next" type="password" minLength={8} required className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Repeat new password</label>
            <input name="confirm" type="password" minLength={8} required className={input} />
          </div>
          <button className="mt-2 rounded bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save password</button>
        </form>
      </div>
    </div>
  );
}
