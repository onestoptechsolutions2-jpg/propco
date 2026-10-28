import Link from "next/link";
import { requireUser, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { buildFeed, buildSnapshot, type FeedItem, type Tone } from "@/lib/today";
import { approveInvoiceFromToday } from "../invoices/actions";
import { sendMessage } from "../chat/actions";

const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;

const TONE: Record<Tone, string> = {
  ok: "bg-green-100 text-green-800",
  warn: "bg-amber-100 text-amber-900",
  bad: "bg-danger/10 text-danger",
  info: "bg-sky-100 text-sky-900",
};

const PATHS: Record<FeedItem["icon"], string> = {
  cash: "M3 7h18v10H3V7zm9 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  doc: "M7 3h8l4 4v14H7V3zM15 3v4h4M10 12h6M10 16h6",
  key: "M8 19a4 4 0 100-8 4 4 0 000 8zM11 12l9-9M16 7l3 3",
  tool: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z",
  chat: "M4 5h16v11H9l-5 4V5z",
  wallet: "M3 7h15a3 3 0 013 3v8H6a3 3 0 01-3-3V7zm0 0l12-3v3M17 14h2",
  card: "M3 6h18v12H3V6zm0 4h18",
};

function Icon({ name }: { name: FeedItem["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

const btn = "rounded border border-border px-3.5 py-2 text-sm font-medium text-ink transition hover:border-ink";
const btnPrimary = "rounded bg-ink px-3.5 py-2 text-sm font-medium text-white transition hover:bg-ink-light";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string; error?: string }> }) {
  const user = await requireUser();
  const { denied, error } = await searchParams;
  const now = new Date();
  const first = user.name?.split(" ")[0];

  if (user.role === "OWNER") return <OwnerHome user={user} first={first} />;

  const [feed, snap] = await Promise.all([buildFeed(user, now), buildSnapshot(user, now)]);
  const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const pct = snap.rent && snap.rent.due > 0 ? Math.round((snap.rent.collected / snap.rent.due) * 100) : 0;
  const waitingPct = snap.rent && snap.rent.due > 0 ? Math.min(100 - pct, Math.round((snap.rent.waiting / snap.rent.due) * 100)) : 0;
  const bands = snap.aging
    ? [
        { label: "Up to 30 days", ...snap.aging.d1to30, color: "bg-amber-600" },
        { label: "31 to 60 days", ...snap.aging.d31to60, color: "bg-danger" },
        { label: "Over 60 days", ...snap.aging.d61plus, color: "bg-danger" },
      ]
    : [];
  const maxBand = Math.max(1, ...bands.map((b) => b.total));

  return (
    <div className="max-w-6xl">
      {denied && <p className="mb-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">You don&apos;t have access to that screen. Ask your administrator if you need it.</p>}
      {error && <p className="mb-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

      <p className="text-xs font-medium uppercase tracking-wider text-muted">{date}</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">
        {feed.length ? `${first ? `${first}, ` : ""}${feed.length} thing${feed.length === 1 ? "" : "s"} need${feed.length === 1 ? "s" : ""} you` : `You're all caught up${first ? `, ${first}` : ""}`}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {feed.length ? "Everything waiting for a decision, most urgent first." : "New payments, invoices and repairs show up here as they happen."}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Needs you" className="min-w-0">
          {feed.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {feed.map((item) => (
                <article key={item.id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3.5 border-t border-border p-4 first:border-t-0">
                  <div className={`grid h-10 w-10 place-items-center rounded-lg ${TONE[item.tone]}`}>
                    <Icon name={item.icon} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-medium text-ink">{item.title}</h2>
                    <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.actions.map((a, i) =>
                        a.kind === "approveInvoice" ? (
                          <form key={i} action={approveInvoiceFromToday.bind(null, a.id)}>
                            <button className={btnPrimary}>{a.label}</button>
                          </form>
                        ) : (
                          <Link key={i} href={a.href} target={a.external ? "_blank" : undefined} rel={a.external ? "noopener noreferrer" : undefined} className={a.primary ? btnPrimary : btn}>
                            {a.label}
                          </Link>
                        )
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <form action={sendMessage} className="sticky bottom-20 mt-4 md:bottom-4">
            <label className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2.5 shadow-md focus-within:border-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5 shrink-0 text-accent" aria-hidden="true">
                <path d={PATHS.chat} strokeLinejoin="round" />
              </svg>
              <input name="text" required maxLength={500} autoComplete="off" aria-label="Tell PropCo what happened" placeholder="Tell PropCo what happened" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
              <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white">Send</button>
            </label>
          </form>
        </section>

        <aside className="grid min-w-0 content-start gap-4" aria-label="This month">
          {snap.rent && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-lg text-ink">{now.toLocaleDateString("en-GB", { month: "long" })} rent</h2>
                {snap.rent.due > 0 && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pct >= 75 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{pct}% collected</span>}
              </div>
              <p className="mt-2 font-serif text-3xl text-ink">{fmt(snap.rent.collected)}</p>
              <p className="text-sm text-muted">of {fmt(snap.rent.due)} due · {snap.rent.paidCount} of {snap.rent.total} payments in</p>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-background" role="img" aria-label={`${pct} percent of this month's rent collected`}>
                <i className="block h-full bg-green-600" style={{ width: `${pct}%` }} />
                <i className="block h-full bg-sky-600" style={{ width: `${waitingPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">Green is paid. Blue is M-Pesa messages waiting for you to approve.</p>
            </div>
          )}
          {snap.aging && bands.some((b) => b.total > 0) && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-serif text-lg text-ink">Unpaid rent by age</h2>
              <ul className="mt-3 grid gap-3 text-sm">
                {bands.map((b) => (
                  <li key={b.label}>
                    <div className="flex justify-between"><span>{b.label} <span className="text-muted">({b.count})</span></span><span className="font-medium">{fmt(b.total)}</span></div>
                    <div className="mt-1 h-1.5 rounded bg-background"><div className={`h-full rounded ${b.color}`} style={{ width: `${(b.total / maxBand) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
              <Link href="/insights" className="mt-3 inline-block text-sm text-accent hover:underline">More in Insights</Link>
            </div>
          )}
          {snap.vacancy && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-serif text-lg text-ink">Empty units</h2>
              <p className="mt-2 font-serif text-2xl text-ink">{fmt(snap.vacancy.loss)}</p>
              <p className="text-sm text-muted">a month from {snap.vacancy.count} vacant unit{snap.vacancy.count === 1 ? "" : "s"}.</p>
              {user.can("listings.manage") && <Link href="/listings" className="mt-2 inline-block text-sm text-accent hover:underline">Put them on vacancy pages</Link>}
            </div>
          )}
          {snap.upcoming.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-serif text-lg text-ink">Coming up</h2>
              <ul className="mt-3 grid gap-2 text-sm">
                {snap.upcoming.map((u, i) => (
                  <li key={i} className="flex justify-between gap-3"><span>{u.label}</span><span className="shrink-0 font-medium">{u.when}</span></li>
                ))}
              </ul>
            </div>
          )}
          {!snap.rent && !snap.vacancy && snap.upcoming.length === 0 && (
            <div className="rounded-lg border border-border bg-accent-light p-5 text-sm text-ink">
              <h2 className="font-serif text-lg">New here?</h2>
              <p className="mt-1">The step-by-step guides walk you through the main jobs.</p>
              <Link href="/guide" className="mt-3 inline-block rounded bg-ink px-4 py-2 text-sm font-medium text-white">Open the guides</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** A property owner's home: their money first, read-only. */
async function OwnerHome({ user, first }: { user: Awaited<ReturnType<typeof requireUser>>; first?: string }) {
  const scope = ownerScopeFilter(user);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [payouts, rent, repairs] = await Promise.all([
    user.ownerId ? prisma.payout.findMany({ where: { ownerId: user.ownerId }, orderBy: { periodStart: "desc" }, take: 3 }) : Promise.resolve([]),
    prisma.payment.findMany({
      where: { dueDate: { gte: monthStart, lt: monthEnd }, lease: { unit: { property: scope } } },
      include: { lease: { include: { tenant: true, unit: { include: { property: true } } } } },
      orderBy: { lease: { unit: { label: "asc" } } },
    }),
    prisma.maintenanceRequest.findMany({
      where: { status: { notIn: ["DONE", "CANCELLED"] }, unit: { property: scope } },
      include: { unit: { include: { property: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const lastPaid = payouts.find((p) => p.status === "PAID");
  const month = now.toLocaleDateString("en-GB", { month: "long" });

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Welcome{first ? `, ${first}` : ""}</h1>
      <p className="mt-1 text-sm text-muted">Your money and your properties, read-only.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-lg border border-border bg-surface">
          <h2 className="p-4 pb-2 font-serif text-lg text-ink">Rent, {month}</h2>
          <ul>
            {rent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
                <span className="min-w-0"><b className="block font-medium text-ink">{p.lease.unit.property.name} {p.lease.unit.label}</b><span className="text-muted">{p.lease.tenant.name}</span></span>
                <span className="shrink-0 text-right"><b className="block">{fmt(Number(p.amount))}</b><span className={p.status === "PAID" ? "text-green-700" : p.status === "LATE" ? "text-danger" : "text-muted"}>{p.status === "PAID" ? "Paid" : p.status === "LATE" ? "Late" : "Due"}</span></span>
              </li>
            ))}
            {rent.length === 0 && <li className="border-t border-border px-4 py-6 text-sm text-muted">No rent due this month yet.</li>}
          </ul>
        </section>
        <aside className="grid min-w-0 content-start gap-4">
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="font-serif text-lg text-ink">Your payouts</h2>
            {lastPaid && <p className="mt-2 text-sm text-muted">Last paid: <b className="text-ink">{fmt(Number(lastPaid.netAmount))}</b> for {lastPaid.periodStart.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}</p>}
            <ul className="mt-3 grid gap-2 text-sm">
              {payouts.map((p) => (
                <li key={p.id} className="flex justify-between gap-3"><span>{p.periodStart.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}</span><span><b>{fmt(Number(p.netAmount))}</b> <span className="text-muted">{p.status === "PAID" ? "paid" : "pending"}</span></span></li>
              ))}
              {payouts.length === 0 && <li className="text-muted">No payouts yet.</li>}
            </ul>
            <Link href="/payouts" className="mt-3 inline-block text-sm text-accent hover:underline">All payouts and statements</Link>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="font-serif text-lg text-ink">Open repairs</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {repairs.map((r) => (
                <li key={r.id}><b className="block font-medium text-ink">{r.description}</b><span className="text-muted">{r.unit.property.name} {r.unit.label}</span></li>
              ))}
              {repairs.length === 0 && <li className="text-muted">Nothing is waiting.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
