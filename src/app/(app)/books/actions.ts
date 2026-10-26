"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/access";
import { audit } from "@/lib/audit";
import { parseQuickEntry } from "@/lib/books";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const back = (q = "") => redirect(`/books${q}`);

/** One chat-style message ("paid 3500 plumber") becomes one cash-book entry. */
export async function addQuickEntry(formData: FormData) {
  const user = await requirePermission("books.manage");
  const text = String(formData.get("text") ?? "").trim();
  const forced = formData.get("kind");
  if (!text) back();
  const parsed = parseQuickEntry(text);
  if (!parsed) back("?error=" + encodeURIComponent("Include an amount, e.g. \"paid 3500 plumber\"."));
  const e = parsed!;
  const kind = forced === "IN" || forced === "OUT" ? forced : e.kind;
  await prisma.ledgerEntry.create({
    data: {
      orgId: user.orgId,
      kind,
      amount: e.amount,
      category: kind === e.kind ? e.category : kind === "IN" ? "Other income" : "Other expense",
      note: e.note,
      createdById: user.id,
    },
  });
  await audit(user, "books.add", `${kind} KES ${e.amount} ${e.note}`);
  revalidatePath("/books");
  back();
}

export async function deleteEntry(formData: FormData) {
  const user = await requirePermission("books.manage");
  const id = String(formData.get("id") ?? "");
  const entry = await prisma.ledgerEntry.findFirst({ where: { id, orgId: user.orgId } });
  if (entry) {
    await prisma.ledgerEntry.delete({ where: { id } });
    await audit(user, "books.delete", `${entry.kind} KES ${entry.amount} ${entry.note ?? ""}`);
  }
  revalidatePath("/books");
  back();
}
