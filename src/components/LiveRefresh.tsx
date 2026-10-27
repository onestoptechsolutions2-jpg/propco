"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Listens for "something changed" from /api/live and re-reads the current page,
 * so new payments, messages and repairs show up without a manual reload.
 * Waits while the tab is hidden or someone is typing, so it never disrupts work.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const typing = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    };
    const refresh = () => {
      if (document.hidden || typing()) return; // try again on focus / blur
      dirty = false;
      router.refresh();
    };
    const schedule = () => {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(refresh, 600);
    };
    const flush = () => dirty && schedule();

    const source = new EventSource("/api/live");
    source.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", flush);
    document.addEventListener("focusout", flush);

    return () => {
      clearTimeout(timer);
      source.close();
      document.removeEventListener("visibilitychange", flush);
      document.removeEventListener("focusout", flush);
    };
  }, [router]);

  return null;
}
