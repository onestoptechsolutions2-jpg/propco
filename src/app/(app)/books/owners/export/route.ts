import { requirePermission } from "@/lib/access";
import { ownerMoney } from "@/lib/owner-money";

const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export async function GET() {
  const user = await requirePermission("books.manage");
  const rows = [["Owner", "Collected", "Commission", "Repairs", "Paid out", "Held"].map(cell).join(",")];
  for (const o of await ownerMoney(user.orgId)) {
    rows.push([o.name, o.collected, o.commission, o.maintenance, o.paidOut, o.held].map((v) => cell(typeof v === "number" ? v.toFixed(2) : v)).join(","));
  }
  return new Response(rows.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="owner-money.csv"' },
  });
}
