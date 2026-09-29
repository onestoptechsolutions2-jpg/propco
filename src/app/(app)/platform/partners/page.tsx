import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/plans";
import type { LeadStatus, ServiceCategory } from "@prisma/client";

const CATEGORIES: ServiceCategory[] = ["INSURANCE", "CLEANING", "MOVERS", "INTERNET", "SECURITY", "SOLAR", "LEGAL", "OTHER"];
const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "WON", "LOST"];
const input = "rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

async function admin() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) throw new Error("Not allowed.");
}

async function addPartner(formData: FormData) {
  "use server";
  await admin();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const category = String(formData.get("category")) as ServiceCategory;
  if (name.length < 2 || phone.length < 9 || !CATEGORIES.includes(category)) throw new Error("Fill in name, category and phone.");
  await prisma.servicePartner.create({
    data: {
      name,
      phone,
      category,
      description: String(formData.get("description") ?? "").trim() || null,
      commissionNote: String(formData.get("commissionNote") ?? "").trim() || null,
    },
  });
  revalidatePath("/platform/partners");
}

async function togglePartner(id: string, active: boolean) {
  "use server";
  await admin();
  await prisma.servicePartner.update({ where: { id }, data: { active } });
  revalidatePath("/platform/partners");
}

async function updateLead(id: string, formData: FormData) {
  "use server";
  await admin();
  const status = String(formData.get("status")) as LeadStatus;
  const commission = formData.get("commissionKes") ? Number(formData.get("commissionKes")) : null;
  if (!STATUSES.includes(status)) throw new Error("Bad status.");
  await prisma.serviceLead.update({
    where: { id },
    data: { status, commissionKes: commission !== null && Number.isFinite(commission) ? commission : null },
  });
  revalidatePath("/platform/partners");
}

export default async function PartnersPage() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();

  const [partners, leads] = await Promise.all([
    prisma.servicePartner.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], include: { _count: { select: { leads: true } } } }),
    prisma.serviceLead.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { partner: true },
    }),
  ]);
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(leads.map((l) => l.orgId))] } },
    select: { id: true, name: true },
  });
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const earned = leads.filter((l) => l.status === "WON").reduce((s, l) => s + Number(l.commissionKes ?? 0), 0);

  return (
    <div className="max-w-4xl">
      <Link href="/platform" className="text-sm text-muted hover:underline">
        ← All companies
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">Service partners</h1>
      <p className="mt-1 text-sm text-muted">
        Providers shown to every company on the Services page. Referral earnings so far: KES {earned.toLocaleString()}.
      </p>

      <form action={addPartner} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-serif text-lg text-ink">Add a partner</h2>
        <div className="flex flex-wrap gap-3">
          <input name="name" required placeholder="Company name" className={`${input} flex-1`} />
          <select name="category" className={input} defaultValue="INSURANCE">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <input name="phone" required placeholder="WhatsApp number" className={`${input} w-44`} />
        </div>
        <input name="description" placeholder="One line customers will see" className={input} />
        <input name="commissionNote" placeholder="Referral deal (private), e.g. 10% of first premium" className={input} />
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Add partner</button>
      </form>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
        {partners.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className={`font-medium ${p.active ? "text-foreground" : "text-muted line-through"}`}>{p.name}</p>
              <p className="text-xs text-muted">
                {p.category.toLowerCase()} · {p.phone} · {p._count.leads} lead{p._count.leads === 1 ? "" : "s"}
                {p.commissionNote ? ` · ${p.commissionNote}` : ""}
              </p>
            </div>
            <form action={togglePartner.bind(null, p.id, !p.active)}>
              <button className="text-xs text-accent hover:underline">{p.active ? "Hide" : "Show"}</button>
            </form>
          </li>
        ))}
        {partners.length === 0 && <li className="px-4 py-5 text-center text-muted">No partners yet.</li>}
      </ul>

      <h2 className="mt-10 font-serif text-xl text-ink">Leads</h2>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
        {leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium text-foreground">
                {orgName.get(l.orgId) ?? "Company"} → {l.partner.name}
              </p>
              <p className="text-xs text-muted">
                {l.createdAt.toISOString().slice(0, 10)}
                {l.note ? ` · ${l.note}` : ""}
              </p>
            </div>
            <form action={updateLead.bind(null, l.id)} className="flex items-center gap-2">
              <select name="status" defaultValue={l.status} className={`${input} py-1`}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                name="commissionKes"
                type="number"
                min={0}
                defaultValue={l.commissionKes ? Number(l.commissionKes) : undefined}
                placeholder="Earned KES"
                className={`${input} w-28 py-1`}
              />
              <button className="text-xs font-medium text-accent hover:underline">Save</button>
            </form>
          </li>
        ))}
        {leads.length === 0 && <li className="px-4 py-5 text-center text-muted">No quote requests yet.</li>}
      </ul>
    </div>
  );
}
