import type { Role } from "@prisma/client";

/**
 * The permission catalogue. Every page and action in the app checks one of
 * these keys, never a role name. A user's permissions come from their custom
 * role (if the admin gave them one) or from the defaults for their built-in
 * role below.
 */
export const PERMISSION_GROUPS: { title: string; items: { key: string; label: string; hint?: string }[] }[] = [
  {
    title: "Portfolio",
    items: [
      { key: "properties.manage", label: "Add and edit properties and units" },
      { key: "owners.manage", label: "Manage owners" },
      { key: "tenants.manage", label: "Manage tenants" },
      { key: "leases.manage", label: "Move tenants in and out, clear units" },
      { key: "listings.manage", label: "Vacancy pages" },
      { key: "stays.manage", label: "Short stays (homestay / BnB)" },
      { key: "access.manage", label: "Door access codes" },
    ],
  },
  {
    title: "Money in",
    items: [
      { key: "rent.manage", label: "Collect rent, confirm M-Pesa, receipts and invoices" },
      { key: "utilities.manage", label: "Utility meters, readings and bills" },
    ],
  },
  {
    title: "Money out",
    items: [
      { key: "payouts.view", label: "View owner payouts and statements" },
      { key: "payouts.manage", label: "Generate payouts and mark them paid" },
      { key: "invoices.manage", label: "Enter, approve and pay supplier invoices" },
      { key: "invoices.approve_large", label: "Approve invoices above the company limit" },
      { key: "supplier_payments.manage", label: "Pay suppliers for completed jobs" },
      { key: "payroll.manage", label: "Payroll (salaries, payslips)", hint: "Sensitive" },
    ],
  },
  {
    title: "Repairs and suppliers",
    items: [
      { key: "maintenance.manage", label: "Log and manage repairs, preventive calendar, photos" },
      { key: "suppliers.manage", label: "Manage suppliers" },
      { key: "services.view", label: "Services and insurance marketplace" },
    ],
  },
  {
    title: "Communication",
    items: [{ key: "messages.manage", label: "Send and track messages" }],
  },
  {
    title: "Administration",
    items: [
      { key: "team.manage", label: "Manage team, roles and company settings", hint: "Sensitive" },
      { key: "billing.manage", label: "Plan and billing", hint: "Sensitive" },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

const STAFF_DEFAULT = ALL_PERMISSIONS.filter(
  (p) => !["payroll.manage", "team.manage", "billing.manage"].includes(p)
).filter((p) => p !== "invoices.approve_large");

const LANDLORD_DEFAULT = [
  "properties.manage",
  "tenants.manage",
  "leases.manage",
  "listings.manage",
  "stays.manage",
  "access.manage",
  "rent.manage",
  "utilities.manage",
  "invoices.manage",
  "invoices.approve_large",
  "maintenance.manage",
  "suppliers.manage",
  "services.view",
];

/** What each built-in role can do. */
export const ROLE_DEFAULTS: Record<Role, string[]> = {
  ADMIN: ALL_PERMISSIONS,
  STAFF: STAFF_DEFAULT,
  LANDLORD: LANDLORD_DEFAULT,
  OWNER: ["payouts.view"],
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  STAFF: "Staff",
  LANDLORD: "Landlord",
  OWNER: "Property owner",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: "Full access, including team, roles, billing and payroll.",
  STAFF: "Runs day-to-day work: rent, repairs, tenants, payouts and invoices. No payroll, billing or team management.",
  LANDLORD: "A self-managing landlord: their own properties, tenants, rent and repairs.",
  OWNER: "A property owner: read-only view of their own properties, repairs and payouts.",
};
