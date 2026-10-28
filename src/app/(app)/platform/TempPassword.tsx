"use client";

import { useActionState } from "react";
import type { TempPasswordState } from "./actions";

/** "Reset password" button that shows the new temporary password once, right here. */
export function TempPassword({ action }: { action: (prev: TempPasswordState) => Promise<TempPasswordState> }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <span>
      <form action={run} className="inline">
        <button disabled={pending} className="text-xs text-accent hover:underline disabled:opacity-60">
          {pending ? "Working…" : "Reset password"}
        </button>
      </form>
      {state?.error && <span className="ml-2 text-xs text-danger">{state.error}</span>}
      {state?.temp && (
        <span className="mt-1 block rounded bg-accent-light px-2 py-1 text-xs text-ink">
          Temporary password for {state.email}: <code className="font-mono text-sm">{state.temp}</code>
          <span className="block text-muted">Shown once. Give it to them securely; they must change it when they sign in.</span>
        </span>
      )}
    </span>
  );
}
