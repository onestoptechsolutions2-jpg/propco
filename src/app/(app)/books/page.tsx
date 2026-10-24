import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { loadBook } from "@/lib/books";
import { addQuickEntry, deleteEntry } from "./actions";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function monthRange(m?: string) {
  const match = m?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const y = match ? Number(match[1]) : now.getUTCFullYear();
  const mo = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(y, mo, 1));
  const to = new Date(Date.UTC(y, mo + 1, 1));
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    from,
    to,
    label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    prev: key(new Date(Date.UTC(y, mo - 1, 1))),
    next: key(to),
    current: key(from),
  };
}

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; error?: string }>;
}) {
  const user = await requirePermission("books.manage");
  const { m, error } = await searchParams;
  const range = monthRange(m);
  const lines = await loadBook(user.orgId, range.from, range.to);

  const moneyIn = lines.filter((l) => l.kind === "IN").reduce((s, l) => s + l.amount, 0);
  const moneyOut = lines.filter((l) => l.kind === "OUT").reduce((s, l) => s + l.amount, 0);
  const byCategory = new Map<string, number>();
  for (const l of lines.filter((l) => l.kind === "OUT")) byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + l.amount);

  // Oldest first, like a chat: newest message sits just above the message box.
  const chrono = [...lines].reverse();
  const days: { day: string; items: typeof lines }[] = [];
  for (const l of chrono) {
    const day = l.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(l);
    else days.push({ day, items: [l] });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-ink">Books</h1>
      <p className="mt-1 text-sm text-muted">
        Every shilling in and out. Rent, supplier invoices, salaries and owner payouts appear on their own once paid.
        Type anything else below, like <em>paid 3500 plumber</em> or <em>received 25k deposit</em>.
      </p>

      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href={`/books?m=${range.prev}`} className="rounded border border-border px-3 py-1.5">← Earlier</Link>
        <span className="font-medium text-ink">{range.label}</span>
        <Link href={`/books?m=${range.next}`} className="rounded border border-border px-3 py-1.5">Later →</Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-border p-3">
          <p className="text-xs text-muted">Money in</p>
          <p className="font-medium text-ink">{fmt(moneyIn)}</p>
        </div>
        <div className="rounded border border-border p-3">
          <p className="text-xs text-muted">Money out</p>
          <p className="font-medium text-ink">{fmt(moneyOut)}</p>
        </div>
        <div className="rounded border border-border p-3">
          <p className="text-xs text-muted">{moneyIn - moneyOut >= 0 ? "Profit" : "Loss"}</p>
          <p className={`font-medium ${moneyIn - moneyOut >= 0 ? "text-ink" : "text-danger"}`}>{fmt(Math.abs(moneyIn - moneyOut))}</p>
        </div>
      </div>

      {byCategory.size > 0 && (
        <details className="mt-3 rounded border border-border p-3 text-sm">
          <summary className="cursor-pointer text-ink">Where the money went</summary>
          <ul className="mt-2 space-y-1">
            {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <li key={c} className="flex justify-between"><span>{c}</span><span>{fmt(v)}</span></li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-3 text-right text-xs">
        <a href={`/books/export?m=${range.current}`} className="text-accent underline">Download CSV for your accountant</a>
      </p>

      <div className="mt-2 space-y-4 rounded-lg bg-accent-light/40 p-3">
        {days.length === 0 && <p className="py-8 text-center text-sm text-muted">Nothing recorded this month yet.</p>}
        {days.map((d) => (
          <div key={d.day}>
            <p className="mb-2 text-center"><span className="rounded-full bg-white px-3 py-0.5 text-[11px] text-muted shadow-sm">{d.day}</span></p>
            <div className="space-y-1.5">
              {d.items.map((l) => (
                <div key={l.id} className={`flex ${l.kind === "OUT" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${l.kind === "OUT" ? "bg-[#dcf8c6]" : "bg-white"}`}>
                    <p className="font-medium text-ink">
                      {l.kind === "OUT" ? "−" : "+"} KES {fmt(l.amount)}
                    </p>
                    <p className="text-ink/80">{l.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      {l.category}
                      {l.source === "MANUAL" && (
                        <form action={deleteEntry}>
                          <input type="hidden" name="id" value={l.id} />
                          <button className="underline">remove</button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

      <form action={addQuickEntry} className="sticky bottom-16 mt-3 flex gap-2 bg-white py-2 md:bottom-0">
        <input
          name="text"
          required
          autoComplete="off"
          placeholder='Type e.g. "paid 3500 plumber"'
          className="min-w-0 flex-1 rounded-full border border-border px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <button name="kind" value="IN" className="rounded-full border border-border px-3 text-sm" title="Record as money in">+ In</button>
        <button className="rounded-full bg-accent px-4 text-sm font-medium text-white">Send</button>
      </form>
    </div>
  );
}
