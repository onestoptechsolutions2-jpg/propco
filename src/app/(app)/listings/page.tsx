import { headers } from "next/headers";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { saveListing, saveContactPhone } from "./actions";
import { PhotoUploader } from "@/components/PhotoUploader";
import { uploadPhoto, deletePhoto } from "@/lib/photo-actions";

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";

export default async function ListingsPage() {
  const user = await requirePermission("listings.manage");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : "";

  const [org, units] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } }),
    prisma.unit.findMany({
      where: {
        property: ownerScopeFilter(user),
        OR: [{ status: "VACANT" }, { listed: true }, { stayType: "SHORT_STAY" }],
      },
      include: { property: true, photos: { select: { id: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl text-ink">Vacancy pages</h1>
      <p className="mt-1 text-sm text-muted">
        Turn a vacant unit into a shareable web page with an “Enquire on WhatsApp” button. Post the link in
        WhatsApp status, Facebook groups or on a To Let sign.
      </p>

      {!org.contactPhone && (
        <form action={saveContactPhone} className="mt-5 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-accent-light p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-ink">
              Your WhatsApp number for enquiries (needed for the Enquire button)
            </label>
            <input name="contactPhone" placeholder="0712 345 678" className={input} />
          </div>
          <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">Save</button>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {units.map((u) => {
          const url = `${base}/v/${u.id}`;
          const price = u.stayType === "SHORT_STAY" && u.nightlyRate ? `KES ${Number(u.nightlyRate).toLocaleString()} a night` : `KES ${Number(u.rentAmount).toLocaleString()} a month`;
          const share = `https://wa.me/?text=${encodeURIComponent(`${u.bedrooms ? u.bedrooms + " bedroom " : ""}to let at ${u.property.name}${u.property.city ? ", " + u.property.city : ""}. ${price}. See photos and enquire: ${url}`)}`;
          return (
            <div key={u.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {u.photos.map((ph) => (
                  <div key={ph.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/photos/${ph.id}`} alt="" className="h-16 w-20 rounded object-cover" />
                    <form action={deletePhoto.bind(null, ph.id)} className="absolute right-0.5 top-0.5">
                      <button className="rounded bg-black/60 px-1.5 text-xs leading-5 text-white" aria-label="Remove photo">
                        ×
                      </button>
                    </form>
                  </div>
                ))}
                <PhotoUploader upload={uploadPhoto.bind(null, "unit", u.id)} label="Add photo" />
              </div>
              <form action={saveListing.bind(null, u.id)}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {u.property.name} · {u.label}
                  </p>
                  <p className="text-xs text-muted">
                    {price} · {u.status.toLowerCase()}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="listed" defaultChecked={u.listed} className="h-4 w-4" />
                  Show this page publicly
                </label>
              </div>

              <div className="mt-3 flex flex-col gap-3">
                <textarea
                  name="listingText"
                  rows={3}
                  defaultValue={u.listingText ?? ""}
                  placeholder="Describe it: near the main road, tiled floors, 24-hour water, quiet compound…"
                  className={input}
                />
                <input name="amenities" defaultValue={u.amenities ?? ""} placeholder="Amenities, separated by commas: WiFi, Parking, Balcony" className={input} />
                <textarea
                  name="photoUrls"
                  rows={2}
                  defaultValue={u.photoUrls ?? ""}
                  placeholder="Photo links, one per line (paste https:// links from Google Photos, Drive or Imgur)"
                  className={input}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-light">Save</button>
                {u.listed && (
                  <>
                    <a href={`/v/${u.id}`} target="_blank" className="text-sm text-accent hover:underline">
                      Open page
                    </a>
                    <a href={share} target="_blank" rel="noopener" className="text-sm text-accent hover:underline">
                      Share on WhatsApp
                    </a>
                    <span className="break-all text-xs text-muted">{url}</span>
                  </>
                )}
              </div>
              </form>
            </div>
          );
        })}
        {units.length === 0 && (
          <p className="text-sm text-muted">No vacant units right now. Vacant and short-stay units appear here.</p>
        )}
      </div>
    </div>
  );
}
