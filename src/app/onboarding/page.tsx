import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRIAL_DAYS } from "@/lib/plans";

// For people who signed in (e.g. with Google) but don't belong to a company yet.
async function createCompany(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const company = String(formData.get("company") ?? "").trim();
  if (company.length < 2) redirect("/onboarding");

  const existing = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (existing.orgId) redirect("/dashboard");

  await prisma.organization.create({
    data: {
      name: company,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      users: { connect: { id: existing.id } },
    },
  });
  await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
  redirect("/guide");
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.orgId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="font-serif text-2xl text-ink">One last step</h1>
        <p className="mt-1 text-sm text-muted">
          What is your company or business called? You get {TRIAL_DAYS} days free with everything unlocked.
        </p>
        <form action={createCompany} className="mt-6 flex flex-col gap-3">
          <input
            name="company"
            required
            minLength={2}
            placeholder="e.g. Coastline Property Managers"
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <button
            type="submit"
            className="rounded bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
          >
            Start my free trial
          </button>
        </form>
      </div>
    </div>
  );
}
