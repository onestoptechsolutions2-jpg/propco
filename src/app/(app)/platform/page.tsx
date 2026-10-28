import Link from "next/link";
import { requirePlatformAdmin, overview, systemHealth, customerPage, STATUS_FILTERS, type StatusFilter } from "@/lib/platform";
import { orgStatus } from "@/lib/plans";
import { PLANS } from "@/lib/plan-catalog";
import { Pager } from "@/components/Pager";
import { PAGE_SIZE, pageNumber } from "@/lib/paging";

const ago = (d: Date | null) => {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 120) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};
const date = (d: Date | null) => (d ? d.toLocaleDateString("en-GB") : "—");
const kes = (n: number) => `KES ${n.toLocaleString("en-US")}`;

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-accent" : warn ? "bg-amber-500" : "bg-danger"}`} />;
}

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = (STATUS_FILTERS as string[]).includes(params.status ?? "") ? (params.status as StatusFilter) : "all";
  const page = pageNumber(params.page);
  const now = new Date();

  const [o, health, list] = await Promise.all([
    overview(now),
    systemHealth(now),
    customerPage({ q, status, page, size: PAGE_SIZE }, now),
  ]);

  const kpis: [string, string | number, string?][] = [
    ["Customers", o.total, `${o.signups7} new this week, ${o.signups30} this month`],
    ["On trial", o.trial],
    ["Paying", o.paying],
    ["Monthly revenue", kes(o.mrr), "from live paid plans"],
    ["Lapsed", o.lapsed, "paid plan ended"],
    ["Units managed", o.units.toLocaleString(), `${o.tenants.toLocaleString()} tenants`],
  ];
  const attention = o.trialsEnding.length + o.plansEnding.length + o.recentlyLapsed.length + o.quiet.length;

  return (
    <div className="max-w-6xl">
      <h1 className="font-serif text-3xl text-ink">PropCo admin</h1>
      <p className="mt-1 text-sm text-muted">Monitor the platform and look after customers.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {kpis.map(([label, value, sub]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-2 font-serif text-2xl text-ink">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">System health</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Dot ok={health.dbOk} />Database {health.dbOk ? "reachable" : "UNREACHABLE"}</li>
            <li>
              <Dot ok={health.workerOk} />Background worker: last seen {ago(health.worker)}
              {!health.workerOk && <span className="text-danger"> (reminders and payment checks are not running)</span>}
            </li>
            <li><Dot ok={health.dailyOk} warn />Daily rent job: last finished {ago(health.dailyJob)}</li>
            <li><Dot ok={health.reconcileOk} warn />Payment checks: last ran {ago(health.reconcile)}</li>
            <li><Dot ok={health.failed === 0} warn />Messages: {health.queued} waiting, {health.failed} failed and {health.skipped} skipped in 24 h</li>
            <li><Dot ok={health.stuckIntents === 0} warn />Online payments: {health.stuckIntents} stuck over 30 min, {health.failedIntents} failed in 24 h</li>
          </ul>
          <p className="mt-3 text-xs text-muted">A message is &quot;skipped&quot; when the customer has no contact details or no provider is set up.</p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Needs attention {attention > 0 && <span className="text-sm text-muted">({attention})</span>}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {o.trialsEnding.map((c) => (
              <li key={`t${c.id}`}>
                <Link href={`/platform/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                <span className="text-muted"> trial ends {date(c.trialEndsAt)}</span>
              </li>
            ))}
            {o.plansEnding.map((c) => (
              <li key={`p${c.id}`}>
                <Link href={`/platform/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                <span className="text-muted"> {PLANS[c.plan].label} ends {date(c.paidUntil)}</span>
              </li>
            ))}
            {o.recentlyLapsed.map((c) => (
              <li key={`l${c.id}`}>
                <Link href={`/platform/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                <span className="text-danger"> lapsed {date(c.paidUntil)}</span>
              </li>
            ))}
            {o.quiet.map((c) => (
              <li key={`q${c.id}`}>
                <Link href={`/platform/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                <span className="text-muted"> paying but quiet: last sign-in {ago(c.last)}</span>
              </li>
            ))}
            {attention === 0 && <li className="text-muted">Nothing needs attention.</li>}
          </ul>
        </section>
      </div>

      <form action="/platform" method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-xs font-medium text-muted">
          Find a customer
          <input type="search" name="q" defaultValue={q} placeholder="Company, account number or a user's email" className="mt-1.5 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs font-medium text-muted">
          Status
          <select name="status" defaultValue={status} className="mt-1.5 block min-w-40 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground">
            <option value="all">All</option>
            <option value="trial">On trial</option>
            <option value="paying">Paying</option>
            <option value="lapsed">Lapsed</option>
            <option value="free">Free</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">Search</button>
      </form>

      <p className="mb-2 mt-4 text-xs text-muted">{list.total} customer{list.total === 1 ? "" : "s"}</p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((c) => {
                const st = orgStatus(c, now);
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <Link href={`/platform/${c.id}`} className="font-medium text-accent hover:underline">{c.name}</Link>
                      <p className="font-mono text-xs text-muted">{c.id.slice(-8).toUpperCase()}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.suspendedAt ? (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">Suspended</span>
                      ) : st.inTrial ? (
                        `Trial, ${st.trialDaysLeft}d left`
                      ) : st.subscribed ? (
                        `${PLANS[c.plan].label} until ${date(c.paidUntil)}`
                      ) : st.lapsed ? (
                        <span className="text-danger">Lapsed {date(c.paidUntil)}</span>
                      ) : (
                        "Free"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{c.units} units · {c._count.properties} properties · {c._count.users} users</td>
                    <td className="px-4 py-3 text-xs text-muted">{ago(c.lastLogin)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{date(c.createdAt)}</td>
                  </tr>
                );
              })}
              {list.rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No customers match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Pager basePath="/platform" page={page} total={list.total} params={{ q, status: status === "all" ? "" : status }} />
    </div>
  );
}
