import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { orgHasPremium } from "@/lib/lease-access";
import { whatsappLink } from "@/lib/whatsapp";
import { UpgradeCard } from "@/components/UpgradeCard";
import { enableShortStay, createBooking, setBookingStatus, recordBookingPayment, markCleaned } from "./actions";

const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function StaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string; enabled?: string }>;
}) {
  const user = await requireRole("STAFF", "LANDLORD");
  if (!(await orgHasPremium(user.orgId))) {
    return <UpgradeCard feature="Short stays (homestay / BnB)" isAdmin={user.role === "ADMIN"} />;
  }
  const { error, added, enabled } = await searchParams;
  const scope = ownerScopeFilter(user);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const DAYS = 14;
  const strip = Array.from({ length: DAYS }, (_, i) => new Date(today.getTime() + i * 86_400_000));

  const [stayUnits, otherUnits, bookings, monthBookings] = await Promise.all([
    prisma.unit.findMany({
      where: { stayType: "SHORT_STAY", property: scope },
      include: { property: true },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    }),
    prisma.unit.findMany({
      where: { stayType: "LONG_TERM", status: { not: "OCCUPIED" }, property: scope },
      include: { property: true },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    }),
    prisma.booking.findMany({
      where: {
        unit: { property: scope },
        OR: [
          { status: { in: ["CONFIRMED", "CHECKED_IN"] }, checkOut: { gte: today } },
          { status: "CHECKED_OUT", cleaned: false },
        ],
      },
      include: { unit: { include: { property: true } } },
      orderBy: { checkIn: "asc" },
    }),
    prisma.booking.findMany({
      where: { unit: { property: scope }, status: { not: "CANCELLED" }, checkIn: { lt: monthEnd }, checkOut: { gt: monthStart } },
      select: { checkIn: true, checkOut: true, total: true, paid: true, nightlyRate: true },
    }),
  ]);

  const codes = await prisma.accessCode.findMany({
    where: { bookingId: { in: bookings.map((b) => b.id) }, active: true },
  });
  const codeByBooking = new Map(codes.map((c) => [c.bookingId, c.code]));

  // This month: nights sold, occupancy, revenue
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
  let nightsSold = 0;
  let revenue = 0;
  let collected = 0;
  for (const b of monthBookings) {
    const from = Math.max(b.checkIn.getTime(), monthStart.getTime());
    const to = Math.min(b.checkOut.getTime(), monthEnd.getTime());
    const n = Math.max(0, Math.round((to - from) / 86_400_000));
    nightsSold += n;
    revenue += n * Number(b.nightlyRate);
    collected += Number(b.paid);
  }
  const occupancy = stayUnits.length ? Math.round((nightsSold / (stayUnits.length * daysInMonth)) * 100) : 0;

  const needsCleaning = bookings.filter((b) => b.status === "CHECKED_OUT" && !b.cleaned);
  const live = bookings.filter((b) => b.status !== "CHECKED_OUT");

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl text-ink">Short stays</h1>
      <p className="mt-1 text-sm text-muted">
        Homestays, BnBs and serviced apartments: bookings, no double-booking, guest door codes and turnover
        cleaning.
      </p>

      {error && <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      {added && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">Booking saved.</p>}
      {enabled && <p className="mt-4 rounded border border-accent/30 bg-accent-light px-3 py-2 text-sm text-ink">Short stays turned on for that unit.</p>}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Occupancy this month", `${occupancy}%`],
          ["Nights sold", nightsSold],
          ["Revenue this month (KES)", fmt(revenue)],
          ["Collected on bookings (KES)", fmt(collected)],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-2 font-serif text-2xl text-ink">{value}</p>
          </div>
        ))}
      </div>

      {stayUnits.length > 0 && (
        <section className="mt-8 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Next {DAYS} days</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="pr-3 text-left font-normal text-muted">Unit</th>
                  {strip.map((d) => (
                    <th key={d.toISOString()} className="w-7 px-0.5 text-center font-normal text-muted">
                      {d.getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stayUnits.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap py-1 pr-3">{u.property.name} · {u.label}</td>
                    {strip.map((d) => {
                      const nightStart = d.getTime() + 12 * 3_600_000; // noon of that day
                      const busy = bookings.some(
                        (b) =>
                          b.unitId === u.id &&
                          b.status !== "CHECKED_OUT" &&
                          b.checkIn.getTime() <= nightStart &&
                          b.checkOut.getTime() > nightStart
                      );
                      return (
                        <td key={d.toISOString()} className="px-0.5 py-1">
                          <div className={`h-5 w-6 rounded ${busy ? "bg-ink" : "bg-accent-light"}`} title={busy ? "Booked" : "Free"} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ink" /> Booked
            <span className="ml-4 mr-1 inline-block h-2 w-2 rounded-sm bg-accent-light" /> Free
          </p>
        </section>
      )}

      {needsCleaning.length > 0 && (
        <section className="mt-6 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <h2 className="font-serif text-lg text-danger">Needs cleaning ({needsCleaning.length})</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {needsCleaning.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3">
                <span>
                  {b.unit.property.name} · {b.unit.label} (guest {b.guestName} left)
                </span>
                <form action={markCleaned.bind(null, b.id)}>
                  <button className="text-xs font-medium text-accent hover:underline">Mark cleaned</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-8 font-serif text-xl text-ink">Current and upcoming bookings</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {live.map((b) => {
          const code = codeByBooking.get(b.id);
          const balance = Number(b.total) - Number(b.paid);
          const wa = whatsappLink(
            b.guestPhone,
            `Hello ${b.guestName}, your stay at ${b.unit.property.name} · ${b.unit.label} is confirmed: check-in ${day(b.checkIn)} from 2pm, check-out ${day(b.checkOut)} by 11am. Total KES ${fmt(b.total)}.${code ? ` Your door code is ${code}.` : ""} We look forward to hosting you!`
          );
          return (
            <li key={b.id} className="rounded-lg border border-border bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {b.guestName} <span className="text-xs font-normal text-muted">· {b.source} · {b.guests} guest{b.guests === 1 ? "" : "s"}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {b.unit.property.name} · {b.unit.label} · {day(b.checkIn)} to {day(b.checkOut)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-ink">KES {fmt(b.total)}</p>
                  <p className={`text-xs ${balance > 0 ? "text-danger" : "text-accent"}`}>
                    {balance > 0 ? `KES ${fmt(balance)} balance` : "Paid in full"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full bg-background px-2 py-1 font-medium text-muted">{b.status.replace("_", " ").toLowerCase()}</span>
                {code && <span className="rounded bg-background px-2 py-1 font-mono tracking-widest text-ink">code {code}</span>}
                {wa && (
                  <a href={wa} target="_blank" rel="noopener" className="font-medium text-accent hover:underline">
                    Send welcome on WhatsApp
                  </a>
                )}
                {b.status === "CONFIRMED" && (
                  <form action={setBookingStatus.bind(null, b.id, "CHECKED_IN")}>
                    <button className="font-medium text-accent hover:underline">Check in</button>
                  </form>
                )}
                {b.status === "CHECKED_IN" && (
                  <form action={setBookingStatus.bind(null, b.id, "CHECKED_OUT")}>
                    <button className="font-medium text-accent hover:underline">Check out</button>
                  </form>
                )}
                {b.status !== "CHECKED_IN" && (
                  <form action={setBookingStatus.bind(null, b.id, "CANCELLED")}>
                    <button className="text-danger hover:underline">Cancel booking</button>
                  </form>
                )}
                {balance > 0 && (
                  <form action={recordBookingPayment.bind(null, b.id)} className="flex items-center gap-1">
                    <input name="amount" type="number" min={1} placeholder="KES received" className={`${input} w-28 py-1`} />
                    <button className="font-medium text-accent hover:underline">Add payment</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
        {live.length === 0 && <li className="text-sm text-muted">No current or upcoming bookings.</li>}
      </ul>

      {stayUnits.length > 0 && (
        <>
          <h2 className="mt-10 font-serif text-xl text-ink">New booking</h2>
          <form action={createBooking} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <select name="unitId" required className={input} defaultValue="">
              <option value="">Which unit?…</option>
              {stayUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property.name} · {u.label} (KES {fmt(u.nightlyRate)} / night)
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-3">
              <input name="guestName" required placeholder="Guest name" className={`${input} flex-1`} />
              <input name="guestPhone" placeholder="Guest phone (WhatsApp)" className={`${input} w-52`} />
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Check-in</label>
                <input name="checkIn" type="date" required defaultValue={day(today)} className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Check-out</label>
                <input name="checkOut" type="date" required className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Price per night (KES)</label>
                <input name="nightlyRate" type="number" min={1} required defaultValue={Number(stayUnits[0].nightlyRate ?? 0) || undefined} className={`${input} w-36`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Guests</label>
                <input name="guests" type="number" min={1} defaultValue={1} className={`${input} w-20`} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <select name="source" className={input} defaultValue="Direct">
                <option>Direct</option>
                <option>Airbnb</option>
                <option>Booking.com</option>
                <option>WhatsApp</option>
                <option>Other</option>
              </select>
              <input name="notes" placeholder="Notes (optional)" className={`${input} flex-1`} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="makeCode" defaultChecked className="h-4 w-4" />
              Create a door code that works only for these dates
            </label>
            <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">
              Save booking
            </button>
          </form>
        </>
      )}

      {otherUnits.length > 0 && (
        <>
          <h2 className="mt-10 font-serif text-xl text-ink">Turn on short stays for a unit</h2>
          <form action={enableShortStay} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-5">
            <select name="unitId" required className={input} defaultValue="">
              <option value="">Choose a unit…</option>
              {otherUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property.name} · {u.label}
                </option>
              ))}
            </select>
            <div>
              <label className="mb-1 block text-xs text-muted">Price per night (KES)</label>
              <input name="nightlyRate" type="number" min={1} required className={`${input} w-40`} />
            </div>
            <button className="rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Turn on</button>
          </form>
        </>
      )}
    </div>
  );
}
