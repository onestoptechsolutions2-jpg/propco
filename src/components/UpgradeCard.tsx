import Link from "next/link";

/** Shown in place of a paid feature on the free plan. */
export function UpgradeCard({ feature, isAdmin }: { feature: string; isAdmin: boolean }) {
  return (
    <div className="max-w-xl rounded-lg border border-border bg-accent-light p-6">
      <h1 className="font-serif text-2xl text-ink">{feature} is on paid plans</h1>
      <p className="mt-2 text-sm text-foreground">
        Your free trial has ended and you are on the free plan. Upgrade to keep using {feature.toLowerCase()}, and
        to manage more than 5 units.
      </p>
      {isAdmin ? (
        <Link
          href="/billing"
          className="mt-4 inline-block rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light"
        >
          See plans
        </Link>
      ) : (
        <p className="mt-4 text-sm text-muted">Ask your company admin to upgrade the plan.</p>
      )}
    </div>
  );
}
