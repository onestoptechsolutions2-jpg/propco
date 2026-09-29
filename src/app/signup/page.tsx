import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRIAL_DAYS } from "@/lib/plans";

const schema = z.object({
  company: z.string().trim().min(2, "Enter your company or business name"),
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

async function signUp(formData: FormData) {
  "use server";
  const parsed = schema.safeParse({
    company: formData.get("company"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const { company, name, email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    redirect(`/signup?error=${encodeURIComponent("That email already has an account. Sign in instead.")}`);
  }

  await prisma.organization.create({
    data: {
      name: company,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      users: {
        create: { name, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
      },
    },
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/guide" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="font-serif text-2xl text-ink">Start your free trial</h1>
        <p className="mt-1 text-sm text-muted">
          {TRIAL_DAYS} days with everything unlocked. No card needed.
        </p>

        {error && (
          <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <form action={signUp} className="mt-6 flex flex-col gap-3">
          {[
            { name: "company", label: "Company / business name", type: "text" },
            { name: "name", label: "Your name", type: "text" },
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Password (8+ characters)", type: "password" },
          ].map((f) => (
            <div key={f.name}>
              <label htmlFor={f.name} className="mb-1 block text-xs font-medium text-muted">
                {f.label}
              </label>
              <input
                id={f.name}
                name={f.name}
                type={f.type}
                required
                minLength={f.type === "password" ? 8 : undefined}
                className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </div>
          ))}
          <button
            type="submit"
            className="mt-2 rounded bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            Create my account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
