"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string };

export function AppNav({
  items,
  userLabel,
  roleLabel,
  signOutAction,
}: {
  items: NavItem[];
  userLabel: string;
  roleLabel: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white md:hidden">
        <span className="font-serif text-lg tracking-tight">PropCo</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle menu"
          className="flex h-9 w-9 items-center justify-center rounded hover:bg-white/10"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {open ? (
              <path
                d="M4 4l12 12M16 4L4 16"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M2.5 5h15M2.5 10h15M2.5 15h15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <nav className="flex flex-col gap-1 bg-ink px-3 pb-4 text-white md:hidden">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded px-3 py-2 text-sm ${
                  active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-2 border-t border-white/10 pt-3 text-xs text-white/60">
            <p className="text-white/90">{userLabel}</p>
            <p className="mt-0.5 uppercase tracking-wide">{roleLabel}</p>
            <form action={signOutAction}>
              <button className="mt-3 text-white/60 underline-offset-2 hover:text-white hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden border-border bg-ink text-white md:flex md:w-60 md:flex-shrink-0 md:flex-col">
        <div className="px-6 py-5">
          <span className="font-serif text-xl tracking-tight">PropCo</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-2 text-sm transition ${
                  active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-6 py-4 text-xs text-white/60">
          <p className="text-white/90">{userLabel}</p>
          <p className="mt-0.5 uppercase tracking-wide">{roleLabel}</p>
          <form action={signOutAction}>
            <button className="mt-3 text-white/60 underline-offset-2 hover:text-white hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
