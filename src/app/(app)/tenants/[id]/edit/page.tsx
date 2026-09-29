import { notFound } from "next/navigation";
import { requireRole, ownerScopeFilter } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateTenant, deleteTenant, createLease } from "../../actions";

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("STAFF", "LANDLORD");

  const [tenant, vacantUnits] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id, orgId: user.orgId },
      include: { leases: { where: { status: "ACTIVE" }, include: { unit: { include: { property: true } } } } },
    }),
    prisma.unit.findMany({
      where: { status: "VACANT", property: ownerScopeFilter(user) },
      include: { property: true },
      orderBy: { property: { name: "asc" } },
    }),
  ]);

  if (!tenant) notFound();

  const updateTenantWithId = updateTenant.bind(null, tenant.id);
  const deleteTenantWithId = deleteTenant.bind(null, tenant.id);
  const activeLease = tenant.leases[0];

  return (
    <div className="max-w-lg">
      <h1 className="font-serif text-3xl text-ink">Edit tenant</h1>

      <form action={updateTenantWithId} className="mt-8 flex flex-col gap-4">
        <Field label="Full name" name="name" defaultValue={tenant.name} required />
        <Field label="Email" name="email" type="email" defaultValue={tenant.email ?? ""} />
        <Field label="Phone" name="phone" defaultValue={tenant.phone ?? ""} />
        <Field label="ID / passport number" name="idNumber" defaultValue={tenant.idNumber ?? ""} />
        <Field label="Emergency contact name" name="emergencyName" defaultValue={tenant.emergencyName ?? ""} />
        <Field label="Emergency contact phone" name="emergencyPhone" defaultValue={tenant.emergencyPhone ?? ""} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Notify via</label>
          <select
            name="notifyChannel"
            defaultValue={tenant.notifyChannel}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </div>
        
        <button
          type="submit"
          className="mt-2 self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
        >
          Save changes
        </button>
      </form>

      <div className="mt-10 border-t border-border pt-6">
        <h2 className="font-serif text-lg text-ink">Lease</h2>
        {activeLease ? (
          <p className="mt-2 text-sm text-foreground">
            Currently leased at {activeLease.unit.property.name} · {activeLease.unit.label}, since{" "}
            {activeLease.startDate.toLocaleDateString()}.{" "}
            <a href={`/leases/${activeLease.id}`} className="font-medium text-accent hover:underline">
              Move-in checklist and move-out
            </a>
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">Not currently leased to a unit.</p>
            <form action={createLease} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Vacant unit</label>
                <select
                  name="unitId"
                  required
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                >
                  <option value="">Select a unit…</option>
                  {vacantUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.property.name} · {unit.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Lease start date</label>
                <input
                  type="date"
                  name="startDate"
                  required
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Monthly rent (KES)</label>
                <input
                  type="number"
                  name="rentAmount"
                  min={0}
                  step="0.01"
                  required
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Deposit (KES)</label>
                <input
                  type="number"
                  name="depositAmount"
                  min={0}
                  step="0.01"
                  className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <button
                type="submit"
                className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-light"
              >
                Create lease
              </button>
            </form>
          </>
        )}
      </div>

      <form action={deleteTenantWithId} className="mt-6 border-t border-border pt-6">
        <button
          type="submit"
          className="rounded border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5"
        >
          Delete tenant
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
