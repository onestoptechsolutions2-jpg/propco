# Contributing

## Workflow

1. Branch from `main`. Keep a change to one purpose.
2. Make the change, with its tests and its documentation.
3. Run the checks in [testing](testing.md#before-you-open-a-pull-request).
4. Open a pull request into `main`. Say what changed, why, how you tested it, and **what you did not test**. A deploy from `main` is what customers get, so be honest about risk (a new migration, a new environment variable, anything unverified).
5. After merge, the deployment applies migrations on start. Mention new environment variables in the pull request.

Write commit messages in the imperative ("Add unpaid-rent ageing to Insights"), explaining the why in the body when it is not obvious.

## Code conventions

- **TypeScript strict, no `any`** unless there is no alternative (and then comment why).
- **Server components by default.** Add `"use client"` only for interactivity (forms with live state, event handlers, `EventSource`). Keep client components small.
- **Validate input with Zod** in server actions (`z.coerce.number()` for form numbers). Never trust a form value, even from a signed-in user.
- **Scope every query by company** and re-check ownership on every write (see [authentication and permissions](auth-and-permissions.md)).
- **Money:** `Decimal` in the database, round computed amounts to 2 places, never use floating-point results as stored truth.
- **Messages to people use plain words.** The audience is a busy property manager on a phone. "Enter the amount" beats "Invalid input". Prefer a clear next step.
- **Redirect with a message for expected errors** (`redirect("/page?error=" + encodeURIComponent(msg))`); throw for things that should not happen. Do not call `redirect()` inside a `try` block (it works by throwing): compute the result in the `try`, redirect after.
- **Audit sensitive changes** with `audit(user, "area.verb", "short detail")`: team and role changes, money moving, support actions.
- **Pagination:** any list that can grow past a screenful uses `src/lib/paging.ts` and `<Pager>`.
- **Styling:** Tailwind with the design tokens (`ink`, `accent`, `muted`, `border`, `surface`, `background`, `danger`). Copy the look of a nearby page. Status lights and badges use clear colours (green fine, amber check, red broken); do not rely on the brand colour alone to mean "healthy".
- **Phone first.** Test at 390 px wide. Tap targets at least about 44 px; no horizontal page scroll.
- **Print pages** (receipts, invoices, statements) use `print:` utilities and `<PrintButton>`.
- **No new infrastructure** (queues, caches, search) without a measured problem and a note in the architecture decisions table.

## Recipes

### Add a screen

1. Create `src/app/(app)/<feature>/page.tsx` (a server component) and, if it changes data, `actions.ts` with `"use server"`.
2. Start the page with `requirePermission(...)`; scope your queries.
3. Add it to the menu: the `NAV` array in `src/app/(app)/layout.tsx`, with a `perm` so people without access do not see it.
4. If it is public (no sign-in), add its path to `PUBLIC_PATHS` in `src/middleware.ts` and be sure it exposes nothing private.
5. Add it to `scripts/docs/screenshots.mjs`, write or update its user-guide page, re-run the screenshots.

### Add a server action

```ts
"use server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, ownerScopeFilter } from "@/lib/access";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const schema = z.object({ amount: z.coerce.number().positive("Enter the amount") });

export async function recordThing(id: string, formData: FormData) {
  const user = await requirePermission("rent.manage");
  const parsed = schema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) redirect(`/thing/${id}?error=` + encodeURIComponent(parsed.error.issues[0].message));

  const thing = await prisma.thing.findFirst({ where: { id, org: { id: user.orgId } } });
  if (!thing) throw new Error("Not found");

  await prisma.thing.update({ where: { id }, data: { amount: parsed.data!.amount } });
  await audit(user, "thing.record", `KES ${parsed.data!.amount}`);
  revalidatePath(`/thing/${id}`);
  redirect(`/thing/${id}`);
}
```

### Add a database change

See [data model: migrations](data-model.md#migrations). Make new columns nullable or defaulted, add the index you need, and re-run the migrate-diff check.

### Add a message (notification)

1. Add the event in `src/lib/notify-events.ts` (or in the worker for scheduled events) calling `notify(...)` with a `dedupeKey` that identifies the occurrence.
2. Make sure the recipient has a way to be reached (`phone`, `email`, `notifyChannel`).
3. Add the event to the table in the [user guide](../user-guide/09-messages-and-whatsapp.md).

### Teach Chat a new phrase

1. In `src/lib/chat.ts`, add a branch in `interpret()` returning text and (optionally) `options`. Choose a keyword pattern narrow enough not to steal other phrases, and keep the order of branches in mind (earlier wins).
2. If it changes data, add a new `ChatOption` type and handle it in `execute()` in `src/app/(app)/chat/actions.ts`, **re-checking permission and ownership there**: stored options are never trusted.
3. Add the phrase to the help text and to the [Chat guide](../user-guide/02-chat.md).

### Add a payment provider

See [payments: adding another provider](../payments.md#adding-another-provider-paystack-pesapal-).

### Add a scheduled job

See [background jobs](background-jobs.md#adding-a-scheduled-job).

### Add a permission

See [authentication and permissions](auth-and-permissions.md#add-a-permission).

### Change a plan or price

Edit `src/lib/plan-catalog.ts` only. Update the tables in the [product overview](../product/README.md) and the [user guide](../user-guide/11-settings-and-billing.md).

## Documentation rules

- Docs live in `docs/` and ship with the code. **A feature is not done until its guide is updated.**
- User guides describe what a person sees and does, using the labels on screen. Developer guides explain why, and where.
- Screenshots come from `scripts/docs/screenshots.sh` (demo data, no real customers). Do not paste real screenshots with real names or numbers.
- Keep claims honest: say what is verified, what is an estimate (tax), and what is not built.
- Check links after moving or renaming a page.

## Security checklist for reviewers

- [ ] Every new query is scoped to the company (or `ownerScopeFilter`)
- [ ] Every new write re-checks ownership and permission, not just the page
- [ ] No secrets, tokens or password material in logs, URLs or the activity log
- [ ] Webhooks verify authenticity, then confirm with the provider before acting
- [ ] New public routes expose nothing private
- [ ] Input validated with Zod; output encoded (React does this by default; avoid `dangerouslySetInnerHTML`)
