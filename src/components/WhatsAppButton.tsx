"use client";

import { useTransition } from "react";

/** Opens WhatsApp (app or web) with the message pre-filled, then marks it sent. */
export function WhatsAppButton({
  href,
  markSent,
}: {
  href: string;
  markSent: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        window.open(href, "_blank", "noopener");
        start(() => markSent());
      }}
      className="rounded bg-[#1f9d55] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#188047] disabled:opacity-60"
    >
      {pending ? "Saving…" : "Send on WhatsApp"}
    </button>
  );
}
