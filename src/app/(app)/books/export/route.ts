import { requirePermission } from "@/lib/access";
import { loadBook } from "@/lib/books";

const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const user = await requirePermission("books.manage");
  const m = new URL(req.url).searchParams.get("m")?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const lines = await loadBook(user.orgId, new Date(Date.UTC(y, mo, 1)), new Date(Date.UTC(y, mo + 1, 1)));

  const rows = [["Date", "Type", "Category", "Description", "In", "Out"].map(cell).join(",")];
  for (const l of [...lines].reverse()) {
    rows.push(
      [l.date.toISOString().slice(0, 10), l.kind === "IN" ? "Money in" : "Money out", l.category, l.title, l.kind === "IN" ? l.amount : "", l.kind === "OUT" ? l.amount : ""]
        .map(cell)
        .join(",")
    );
  }
  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="books-${y}-${String(mo + 1).padStart(2, "0")}.csv"`,
    },
  });
}
