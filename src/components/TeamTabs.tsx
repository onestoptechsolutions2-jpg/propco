import Link from "next/link";

const TABS = [
  { key: "people", href: "/team", label: "People" },
  { key: "roles", href: "/team/roles", label: "Roles" },
  { key: "activity", href: "/team/audit", label: "Activity" },
];

export function TeamTabs({ active }: { active: "people" | "roles" | "activity" }) {
  return (
    <div className="mt-4 flex gap-2 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            active === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
