import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { whatsappLink } from "@/lib/whatsapp";
import { redirect } from "next/navigation";

const LABEL: Record<string, string> = {
  INSURANCE: "Insurance",
  CLEANING: "Cleaning",
  MOVERS: "Movers",
  INTERNET: "Internet and WiFi",
  SECURITY: "Security and CCTV",
  SOLAR: "Solar and backup power",
  LEGAL: "Legal and valuation",
  OTHER: "Other services",
};

async function requestQuote(partnerId: string, formData: FormData) {
  "use server";
  const user = await requireRole("STAFF", "LANDLORD");
  const partner = await prisma.servicePartner.findFirst({ where: { id: partnerId, active: true } });
  if (!partner) throw new Error("This provider is no longer available.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);

  await prisma.serviceLead.create({ data: { partnerId, orgId: user.orgId, note: note || null } });

  const link = whatsappLink(
    partner.phone,
    `Hello ${partner.name}, I am ${user.name ?? "a customer"} from ${org.name}, found through PropCo. I would like a quote for ${LABEL[partner.category].toLowerCase()}.${note ? ` ${note}` : ""}`
  );
  redirect(link ?? "/services");
}

export default async function ServicesPage() {
  await requireRole("STAFF", "LANDLORD");
  const partners = await prisma.servicePartner.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const groups = new Map<string, typeof partners>();
  for (const p of partners) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Services and insurance</h1>
      <p className="mt-1 text-sm text-muted">
        Trusted providers for your properties: cover the building, keep it clean, and move tenants in and out. Ask
        for a quote and the message opens in your WhatsApp.
      </p>

      {partners.length === 0 && (
        <p className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          No providers are listed yet. Check back soon.
        </p>
      )}

      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} className="mt-8">
          <h2 className="font-serif text-xl text-ink">{LABEL[cat]}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {list.map((p) => (
              <form
                key={p.id}
                action={requestQuote.bind(null, p.id)}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <p className="font-medium text-foreground">{p.name}</p>
                {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    name="note"
                    placeholder="What do you need? (optional)"
                    className="min-w-0 flex-1 rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                  />
                  <button className="rounded bg-[#1f9d55] px-4 py-2 text-sm font-medium text-white hover:bg-[#188047]">
                    Get a quote on WhatsApp
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
