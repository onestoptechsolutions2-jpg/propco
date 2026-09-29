"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; hint?: string; badge?: number };
export type NavGroup = { title?: string; items: NavItem[] };

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {groups.map((group, i) => (
        <div key={group.title ?? i} className={i > 0 ? "mt-4" : ""}>
          {group.title && (
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/40">
              {group.title}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const matches = (href: string) => pathname === href || pathname.startsWith(href + "/");
              // Only the most specific matching item is highlighted (e.g. /rent/confirm, not /rent).
              const active =
                matches(item.href) &&
                !groups.some((g) => g.items.some((o) => o.href.length > item.href.length && matches(o.href)));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded px-3 py-2 text-sm transition ${
                    active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>
                    {item.label}
                    {item.hint && <span className="block text-[11px] font-normal text-white/50">{item.hint}</span>}
                  </span>
                  {!!item.badge && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function AppNav({
  groups,
  userLabel,
  roleLabel,
  signOutAction,
}: {
  groups: NavGroup[];
  userLabel: string;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const account = (
    <div className="text-xs text-white/60">
      <p className="text-white/90">{userLabel}</p>
      <p className="mt-0.5 uppercase tracking-wide">{roleLabel}</p>
      <form action={signOutAction}>
        <button className="mt-3 text-white/60 underline-offset-2 hover:text-white hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-ink px-4 py-3 text-white md:hidden print:hidden">
        <span className="font-serif text-lg tracking-tight">PropCo</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle menu"
          className="flex h-9 items-center gap-2 rounded px-2 text-sm hover:bg-white/10"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <nav className="bg-ink px-3 pb-4 text-white md:hidden">
          <NavList groups={groups} onNavigate={() => setOpen(false)} />
          <div className="mt-4 border-t border-white/10 px-3 pt-3">{account}</div>
        </nav>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden print:!hidden border-border bg-ink text-white md:flex md:w-64 md:flex-shrink-0 md:flex-col">
        <div className="px-6 py-5">
          <span className="font-serif text-xl tracking-tight">PropCo</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList groups={groups} />
        </nav>
        <div className="border-t border-white/10 px-6 py-4">{account}</div>
      </aside>
    </>
  );
}
