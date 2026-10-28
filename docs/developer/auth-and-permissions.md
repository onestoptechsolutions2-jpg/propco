# Authentication and permissions

## Sign-in

Auth.js (next-auth 5) with a credentials provider (email and password, bcrypt) and optional Google. Sessions are JWTs that last 90 days, which keeps phones signed in. `src/lib/auth.ts` holds the configuration, including:

- **Lockout:** five wrong passwords lock the account for 15 minutes (`failedLogins`, `lockedUntil`).
- **Blocked sign-in:** suspended people (`User.active = false`) and anyone in a suspended company (`Organization.suspendedAt`) cannot sign in.
- `lastLoginAt` is updated on success.

Because sessions last 90 days, **nothing important is trusted from the token**. Role, company, permissions and suspension are read from the database on every request.

## The access helpers (`src/lib/access.ts`)

| Helper | Use |
|---|---|
| `requireUser()` | Redirects to `/login` if signed out or suspended (person or company), to `/onboarding` if not in a company, to `/account/password` if a password change is forced. Returns the user with `orgId`, `role`, `perms` and `can(permission)` |
| `requirePermission(...perms)` | `requireUser()` plus: the user must hold **at least one** of the permissions, else redirect with "denied" |
| `requireRole(...roles)` | Rare, role-specific checks. Prefer permissions |
| `ownerScopeFilter(user)` | The `where` fragment for properties: the whole company for Admin/Staff, only the user's own Owner record for Landlord/Owner |
| `canManageOwnerRecords(user, ownerId, orgId)` | Can this user write to records belonging to this owner? Never across companies |

`requireUser` is cached for the duration of one request, so calling it in the layout, the page and an action costs one query.

### The pattern for every page and action

```ts
// page.tsx
export default async function Page() {
  const user = await requirePermission("rent.manage");        // 1. who and what they may do
  const leases = await prisma.lease.findMany({
    where: { unit: { property: ownerScopeFilter(user) } },    // 2. only what they may see
  });
  ...
}

// actions.ts
"use server";
export async function doThing(id: string, formData: FormData) {
  const user = await requirePermission("rent.manage");        // checks again: a form can be posted by anyone
  const lease = await prisma.lease.findFirst({ where: { id, unit: { property: ownerScopeFilter(user) } } });
  if (!lease) throw new Error("Not found");                    // 3. the record must be theirs
  ...
  await audit(user, "rent.record", "...");                     // 4. leave a trace for sensitive changes
}
```

Never load a record by id alone. Always include the company (or `ownerScopeFilter`) in the `where`.

## Roles and permissions (`src/lib/permissions.ts`)

- `PERMISSION_GROUPS` is the **catalogue**: the keys, labels and groups shown when building a role. `ALL_PERMISSIONS` is derived from it.
- `ROLE_DEFAULTS` maps the built-in roles to permission lists. Admin has all of them; Staff has everything except payroll, books, team, billing and large-invoice approval; Landlord has the property-running set; Owner has `payouts.view` only.
- A user with a **custom role** (`User.orgRoleId`) gets exactly `OrgRole.permissions`; otherwise the defaults for their built-in role apply.
- Admins can only grant permissions they hold, only admins create admins, and the last active admin cannot be removed (enforced in `team/actions.ts`).

### Add a permission

1. Add `{ key: "thing.manage", label: "...", hint?: "..." }` to the right group in `PERMISSION_GROUPS`.
2. Decide which built-in roles should get it by default (`STAFF_DEFAULT` excludes a list; `LANDLORD_DEFAULT` is explicit). Admin gets it automatically.
3. Check it with `requirePermission("thing.manage")` in the page **and** the actions, and `user.can("thing.manage")` to hide menu items.
4. Add the menu item's `perm` in `src/app/(app)/layout.tsx`.
5. Existing custom roles do **not** get it automatically; mention it in release notes.

## Company separation

Rules that keep one company out of another's data:

1. Every query that reaches company data filters by company, directly or through the ownership chain.
2. Writes re-check ownership of the target record (`findFirst` with the company filter, then act), never `update({ where: { id } })` alone.
3. Public routes (`/v/<id>` vacancy pages, `/api/photos`, payment webhooks, `/pay/done`) expose only what is meant to be public and check for themselves.
4. The `/api/live` stream only emits a change signal for the caller's own company.

The **isolation test** (`scripts/isolation-test`) seeds two companies, then attacks company B's data from company A's session across read paths, write paths and a before/after database diff. Run it before any release that touches data access, and extend it when you add a top-level record type.

## Platform admin (PropCo staff)

`isPlatformAdmin(email)` checks `PLATFORM_ADMIN_EMAILS`. `requirePlatformAdmin()` (in `src/lib/platform.ts`) returns a plain 404 for everyone else, so the console's existence is not advertised. Support actions are in `src/lib/platform-ops.ts`; each writes to the customer's activity log as `Support: <email>`. See the [admin console guide](../admin-console.md).

## Secrets

- Passwords: bcrypt hashes only. Temporary passwords are shown once and never logged.
- Payment-provider keys: AES-256-GCM in `PaymentSettings`, key from `PAYMENTS_ENCRYPTION_KEY` (see [payments](../payments.md)).
- Do not log request bodies from payment webhooks, tokens or keys.
