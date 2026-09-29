import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

const FEATURES = [
  ["Rent collection", "See who has paid, who is late, and record M-Pesa, bank or cash payments in seconds."],
  ["Owner payouts", "Commission and repair costs are worked out for you, every month, for every owner."],
  ["Repairs & suppliers", "Log a repair, send it to a plumber, and pay them. Costs land on the right owner."],
  ["WhatsApp reminders", "Late-rent and update messages ready to send from your own WhatsApp in one tap."],
  ["Works on your phone", "Install it like an app. Simple step-by-step guides for every task."],
  ["Made for Kenya", "KES, M-Pesa, and the way agencies here actually work."],
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="font-serif text-xl text-ink">PropCo</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-muted hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="rounded bg-ink px-4 py-2 font-medium text-white hover:bg-ink-light">
            Start free trial
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-14 text-center sm:py-20">
        <h1 className="font-serif text-4xl text-ink sm:text-5xl">
          Property management, without the spreadsheets.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
          Collect rent, pay owners, handle repairs and keep everyone informed, all in one simple app built for
          Kenyan landlords and agencies.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="rounded bg-ink px-6 py-3 font-medium text-white hover:bg-ink-light">
            Start your {TRIAL_DAYS}-day free trial
          </Link>
          <a href="#pricing" className="rounded border border-border px-6 py-3 font-medium hover:border-ink">
            See pricing
          </a>
        </div>
        <p className="mt-3 text-xs text-muted">No card needed. Free forever for up to 5 units.</p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="rounded-lg border border-border bg-surface p-5">
            <h3 className="font-serif text-lg text-ink">{title}</h3>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="mx-auto max-w-5xl px-4 pb-20">
        <h2 className="text-center font-serif text-3xl text-ink">Simple pricing</h2>
        <p className="mt-1 text-center text-sm text-muted">Priced per month in KES. Upgrade or cancel any time.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(PLANS).map(([key, p]) => (
            <div
              key={key}
              className={`flex flex-col rounded-lg border bg-surface p-5 ${key === "PRO" ? "border-accent" : "border-border"}`}
            >
              <h3 className="font-serif text-lg text-ink">{p.label}</h3>
              <p className="mt-2 font-serif text-3xl text-ink">
                {p.priceKes === 0 ? "Free" : `KES ${p.priceKes.toLocaleString()}`}
              </p>
              {p.priceKes > 0 && <p className="text-xs text-muted">per month</p>}
              <p className="mt-3 text-sm text-foreground">{p.blurb}</p>
              <Link
                href="/signup"
                className="mt-auto pt-5 text-sm font-medium text-accent hover:underline"
              >
                {p.priceKes === 0 ? "Start free" : "Try it free"}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
