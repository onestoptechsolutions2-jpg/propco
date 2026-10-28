import Link from "next/link";
import { notFound } from "next/navigation";
import type { Plan } from "@prisma/client";
import { requirePlatformAdmin, customerDetail } from "@/lib/platform";
import { orgStatus } from "@/lib/plans";
import { PLANS } from "@/lib/plan-catalog";
import {
  activatePlan, extendTrial, suspendOrg, unsuspendOrg, addNote, unlockUser, forcePasswordChange, setUserActive, issueTempPassword,
} from "../actions";
import { TempPassword } from "../TempPassword";

const input = "rounded border border-border px-2 py-1.5 text-sm outline-none focus:border-ink";
const card = "rounded-lg border border-border bg-surface p-5";
const stamp = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "never");
const kes = (n: unknown) => `KES ${Number(n).toLocaleString("en-US")}`;
const count = (rows: { status: string; _count: number }[], s: string) => rows.find((r) => r.status === s)?._count ?? 0;

export default async function CustomerPage({ params }: { params: Promise<{ orgId: string }> }) {
  const me = await requirePlatformAdmin();
  const { orgId } = await params;
  const d = await customerDetail(orgId);
  if (!d) notFound();
  const { org } = d;
  const st = orgStatus(org);
  const now = new Date();
  const isMine = org.id === me.orgId;

  return (
    <div className="max-w-6xl">
      <Link href="/platform" className="text-sm text-muted hover:underline">← All customers</Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="font-serif text-3xl text-ink">{org.name}</h1>
        <span className="font-mono text-sm text-muted">{org.id.slice(-8).toUpperCase()}</span>
        <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-ink">
          {org.suspendedAt ? "Suspended" : st.inTrial ? `Trial, ${st.trialDaysLeft}d left` : st.subscribed ? `${PLANS[org.plan].label} until ${org.paidUntil?.toLocaleDateString("en-GB")}` : st.lapsed ? "Lapsed" : "Free"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">Joined {org.createdAt.toLocaleDateString("en-GB")}{org.contactPhone ? ` · ${org.contactPhone}` : ""}</p>

      {org.suspendedAt && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
          <p className="text-danger">Suspended {org.suspendedAt.toLocaleDateString("en-GB")}: {org.suspendedReason}. Nobody in this company can sign in.</p>
          <form action={unsuspendOrg.bind(null, org.id)}>
            <button className="rounded bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-light">Reactivate company</button>
          </form>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Properties / units", `${d.properties} / ${d.unitCount}`],
          ["Tenants (active leases)", `${d.tenants} (${d.activeLeases})`],
          ["Rent, last 90 days", `${count(d.payments, "PAID")} paid · ${count(d.payments, "LATE")} late · ${count(d.payments, "PENDING")} due`],
          ["Messages, 7 days", `${count(d.notifCounts, "SENT")} sent · ${count(d.notifCounts, "FAILED")} failed · ${count(d.notifCounts, "SKIPPED")} skipped`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-2 text-sm font-medium text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-serif text-lg text-ink">Plan and billing</h2>
          {org.billingNote && <p className="mt-2 text-xs text-muted">{org.billingNote}</p>}
          <form action={activatePlan.bind(null, org.id)} className="mt-3 flex flex-wrap items-center gap-2">
            <select name="plan" defaultValue={org.plan === "FREE" ? "GROWTH" : org.plan} className={input}>
              {(Object.keys(PLANS) as Plan[]).map((k) => <option key={k} value={k}>{PLANS[k].label}</option>)}
            </select>
            <input name="months" type="number" min={1} max={24} defaultValue={1} className={`${input} w-16`} />
            <span className="text-xs text-muted">month(s)</span>
            <button className="rounded bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-light">Activate</button>
          </form>
          <form action={extendTrial.bind(null, org.id)} className="mt-2">
            <button className="text-xs text-accent hover:underline">Extend trial by 14 days (now ends {org.trialEndsAt.toLocaleDateString("en-GB")})</button>
          </form>
          {!org.suspendedAt && !isMine && (
            <form action={suspendOrg.bind(null, org.id)} className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <input name="reason" required placeholder="Reason (shown on this page)" className={`${input} min-w-48 flex-1`} />
              <button className="rounded border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/5">Suspend company</button>
            </form>
          )}
        </section>

        <section className={card}>
          <h2 className="font-serif text-lg text-ink">Online payments</h2>
          <p className="mt-2 text-xs text-muted">
            M-Pesa: {d.settings?.mpesaEnabled ? `on (${d.settings.mpesaEnv})` : "off"} · Cards/bank: {d.settings?.flutterwaveEnabled ? "on" : "off"}. Keys are never shown here.
          </p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {d.intents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {kes(i.amount)} · {i.purpose === "RENT" ? "rent" : "plan"} · {i.provider === "MPESA" ? "M-Pesa" : "Flutterwave"} · {i.createdAt.toLocaleDateString("en-GB")}
                  {i.failureReason && <span className="block text-xs text-muted">{i.failureReason}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${i.status === "SUCCESS" ? "bg-accent-light text-accent" : i.status === "FAILED" ? "bg-danger/10 text-danger" : "bg-background text-ink"}`}>{i.status.toLowerCase()}</span>
              </li>
            ))}
            {d.intents.length === 0 && <li className="py-1.5 text-muted">No online payments yet.</li>}
          </ul>
        </section>
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="font-serif text-lg text-ink">People ({d.users.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-2 pr-3">Person</th><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Last sign-in</th><th className="py-2 pr-3">State</th><th className="py-2">Support</th></tr>
            </thead>
            <tbody>
              {d.users.map((u) => {
                const locked = !!u.lockedUntil && u.lockedUntil > now;
                return (
                  <tr key={u.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3"><p className="font-medium text-foreground">{u.name ?? "—"}</p><p className="text-xs text-muted">{u.email}</p></td>
                    <td className="py-2 pr-3 text-xs">{u.orgRole?.name ?? u.role.toLowerCase()}</td>
                    <td className="py-2 pr-3 text-xs text-muted">{stamp(u.lastLoginAt)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {!u.active && <span className="text-danger">suspended </span>}
                      {locked && <span className="text-danger">locked </span>}
                      {u.failedLogins > 0 && <span className="text-muted">{u.failedLogins} wrong password(s) </span>}
                      {u.mustChangePassword && <span className="text-muted">must change password </span>}
                      {u.active && !locked && u.failedLogins === 0 && !u.mustChangePassword && <span className="text-muted">ok</span>}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {(locked || u.failedLogins > 0) && (
                          <form action={unlockUser.bind(null, org.id, u.id)}><button className="text-xs text-accent hover:underline">Unlock</button></form>
                        )}
                        <TempPassword action={issueTempPassword.bind(null, org.id, u.id)} />
                        <form action={forcePasswordChange.bind(null, org.id, u.id)}><button className="text-xs text-muted hover:underline">Force new password</button></form>
                        <form action={setUserActive.bind(null, org.id, u.id, !u.active)}>
                          <button className="text-xs text-muted hover:underline">{u.active ? "Suspend" : "Reactivate"}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Every action here is recorded in the customer&apos;s own activity log as &quot;Support: your email&quot;.</p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-serif text-lg text-ink">Message problems</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {d.notifications.map((n) => (
              <li key={n.id} className="py-1.5">
                <span className={n.status === "FAILED" ? "text-danger" : "text-muted"}>{n.status.toLowerCase()}</span> · {n.channel.toLowerCase()} · {n.event.toLowerCase().replace(/_/g, " ")} · {n.createdAt.toLocaleDateString("en-GB")}
                <span className="block text-xs text-muted">{n.recipientName}: {n.error ?? ""}</span>
              </li>
            ))}
            {d.notifications.length === 0 && <li className="py-1.5 text-muted">No failed or skipped messages.</li>}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-serif text-lg text-ink">Internal notes</h2>
          <form action={addNote.bind(null, org.id)} className="mt-3 flex flex-col gap-2">
            <textarea name="body" required rows={2} placeholder="What happened, what you told them, what to follow up. Customers never see this." className={`${input} w-full`} />
            <button className="self-start rounded bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-light">Add note</button>
          </form>
          <ul className="mt-3 space-y-3 text-sm">
            {d.notes.map((n) => (
              <li key={n.id}>
                <p className="whitespace-pre-line text-foreground">{n.body}</p>
                <p className="text-xs text-muted">{n.authorEmail} · {stamp(n.createdAt)}</p>
              </li>
            ))}
            {d.notes.length === 0 && <li className="text-muted">No notes yet.</li>}
          </ul>
        </section>
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="font-serif text-lg text-ink">Recent activity</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {d.audit.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span><span className={a.actorName.startsWith("Support:") ? "font-medium text-accent" : "text-foreground"}>{a.actorName}</span> · {a.action}{a.detail ? ` · ${a.detail}` : ""}</span>
              <span className="text-xs text-muted">{stamp(a.createdAt)}</span>
            </li>
          ))}
          {d.audit.length === 0 && <li className="py-1.5 text-muted">Nothing recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
