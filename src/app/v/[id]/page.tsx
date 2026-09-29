import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { whatsappLink } from "@/lib/whatsapp";

async function getUnit(id: string) {
  const unit = await prisma.unit.findFirst({
    where: { id, listed: true, OR: [{ status: "VACANT" }, { stayType: "SHORT_STAY" }] },
    include: { property: { include: { org: true } } },
  });
  return unit;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const u = await getUnit(id);
  if (!u) return { title: "Listing not available" };
  return {
    title: `${u.bedrooms ? u.bedrooms + " bedroom " : ""}${u.label}, ${u.property.name}`,
    description: u.listingText?.slice(0, 150) ?? `To let at ${u.property.name}`,
  };
}

/** Public vacancy page. Shows only what a prospect needs: no owner or exact address details. */
export default async function VacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getUnit(id);
  if (!u) notFound();

  const shortStay = u.stayType === "SHORT_STAY" && u.nightlyRate;
  const price = shortStay
    ? `KES ${Number(u.nightlyRate).toLocaleString()} / night`
    : `KES ${Number(u.rentAmount).toLocaleString()} / month`;
  const photos = (u.photoUrls ?? "").split("\n").filter(Boolean);
  const amenities = (u.amenities ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  const wa = whatsappLink(
    u.property.org.contactPhone,
    `Hello, I am interested in ${u.label} at ${u.property.name} (${price}). Is it still available?`
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-serif text-lg text-ink">{u.property.org.name}</p>

        {photos.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {photos.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={`${u.label} at ${u.property.name}`} className="h-48 w-full rounded-lg object-cover" />
            ))}
          </div>
        )}

        <h1 className="mt-5 font-serif text-3xl text-ink">
          {u.bedrooms ? `${u.bedrooms} bedroom ` : ""}
          {u.label}
        </h1>
        <p className="mt-1 text-muted">
          {u.property.name}
          {u.property.city ? `, ${u.property.city}` : ""}
        </p>
        <p className="mt-3 font-serif text-2xl text-accent">{price}</p>

        <p className="mt-4 text-sm text-muted">
          {u.bedrooms ? `${u.bedrooms} bed` : ""}
          {u.bathrooms ? ` · ${u.bathrooms} bath` : ""}
        </p>

        {u.listingText && <p className="mt-4 whitespace-pre-wrap text-foreground">{u.listingText}</p>}

        {amenities.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {amenities.map((a) => (
              <li key={a} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground">
                {a}
              </li>
            ))}
          </ul>
        )}

        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener"
            className="mt-8 block rounded bg-[#1f9d55] px-6 py-3 text-center font-medium text-white hover:bg-[#188047]"
          >
            Enquire on WhatsApp
          </a>
        ) : (
          <p className="mt-8 rounded border border-border bg-surface p-4 text-sm text-muted">
            Contact {u.property.org.name} to view this place.
          </p>
        )}
        <p className="mt-8 text-center text-xs text-muted">Listed with PropCo</p>
      </div>
    </div>
  );
}
