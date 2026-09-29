"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker and shows a friendly "Install app" banner. */
export function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    let wasDismissed = false;
    try {
      wasDismissed = localStorage.getItem("propco-install-dismissed") === "1";
    } catch {}
    // Deferred so state isn't set synchronously inside the effect body.
    const t = setTimeout(() => {
      setDismissed(standalone || wasDismissed);
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    }, 0);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("propco-install-dismissed", "1");
    } catch {}
  }

  if (dismissed || (!installEvent && !isIos)) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent-light px-4 py-3 text-sm text-ink print:hidden">
      <p className="flex-1">
        <strong>Install PropCo on this device</strong> for one-tap access.
        {!installEvent && isIos && " Tap the Share button, then “Add to Home Screen”."}
      </p>
      {installEvent && (
        <button
          type="button"
          onClick={async () => {
            await installEvent.prompt();
            await installEvent.userChoice;
            setInstallEvent(null);
            dismiss();
          }}
          className="rounded bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-ink-light"
        >
          Install app
        </button>
      )}
      <button type="button" onClick={dismiss} className="text-xs text-muted hover:underline">
        Not now
      </button>
    </div>
  );
}
