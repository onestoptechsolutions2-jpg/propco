"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = { href: string; label: string; hint?: string; badge?: number };
export type NavGroup = { title?: string; items: NavItem[] };
export type IconName = "home" | "cash" | "wrench" | "chat" | "users" | "building" | "wallet";
export type QuickItem = { href: string; label: string; icon: IconName; badge?: number };

const ICONS: Record<IconName | "more", string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z",
  cash: "M3 7h18v10H3V7zm9 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 10v4M18 10v4",
  wrench: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z",
  chat: "M4 5h16v11H9l-5 4V5z",
  users: "M16 11a3 3 0 100-6 3 3 0 000 6zM8 12a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5",
  building: "M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18",
  wallet: "M3 7h15a3 3 0 013 3v8H6a3 3 0 01-3-3V7zm0 0l12-3v3M17 14h2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

function Icon({ name, className = "h-6 w-6" }: { name: IconName | "more"; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {groups.map((group, i) => (
        <div key={group.title ?? i} className={i > 0 ? "mt-4" : ""}>
          {group.title && (
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/40">{group.title}</p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              // Only the most specific matching item is highlighted (e.g. /rent/confirm, not /rent).
              const active =
                matches(pathname, item.href) &&
                !groups.some((g) => g.items.some((o) => o.href.length > item.href.length && matches(pathname, o.href)));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded px-3 py-2.5 text-sm transition ${
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
  quick,
  userLabel,
  roleLabel,
  signOutAction,
}: {
  groups: NavGroup[];
  quick: QuickItem[];
  userLabel: string;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the "More" sheet whenever the page changes.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  // The sheet is a full-screen overlay: stop the page behind it from scrolling.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const account = (
    <div className="text-xs text-white/60">
      <p className="text-white/90">{userLabel}</p>
      <p className="mt-0.5 uppercase tracking-wide">{roleLabel}</p>
      <form action={signOutAction}>
        <button className="mt-3 text-white/60 underline-offset-2 hover:text-white hover:underline">Sign out</button>
      </form>
    </div>
  );

  // The most specific bottom-bar button that matches the current page is "on".
  const activeQuick = quick
    .filter((q) => matches(pathname, q.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {/* Mobile top bar: just the name */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-ink px-4 py-3 text-white md:hidden print:hidden">
        <span className="font-serif text-lg tracking-tight">PropCo</span>
        <span className="text-xs uppercase tracking-wide text-white/50">{roleLabel}</span>
      </div>

      {/* Mobile "More" sheet: everything else, grouped */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[52px] z-30 overflow-y-auto bg-ink px-3 pb-28 pt-4 text-white md:hidden print:hidden">
          <NavList groups={groups} onNavigate={() => setOpen(false)} />
          <div className="mt-4 border-t border-white/10 px-3 pt-3">{account}</div>
        </div>
      )}

      {/* Mobile bottom bar: the few things people do all day, big and simple */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {quick.map((q) => {
            const on = !open && activeQuick === q.href;
            return (
              <li key={q.href} className="flex-1">
                <Link
                  href={q.href}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    on ? "text-ink" : "text-muted"
                  }`}
                >
                  <span className={`flex h-8 w-12 items-center justify-center rounded-full ${on ? "bg-accent-light" : ""}`}>
                    <Icon name={q.icon} />
                  </span>
                  {q.label}
                  {!!q.badge && (
                    <span className="absolute right-[22%] top-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
                      {q.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                open ? "text-ink" : "text-muted"
              }`}
            >
              <span className={`flex h-8 w-12 items-center justify-center rounded-full ${open ? "bg-accent-light" : ""}`}>
                <Icon name="more" />
              </span>
              {open ? "Close" : "More"}
            </button>
          </li>
        </ul>
      </nav>

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
