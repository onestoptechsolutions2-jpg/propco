"use client";

import { useRef, useTransition } from "react";

const STATUS_STYLES: Record<string, string> = {
  VACANT: "bg-accent-light text-accent",
  OCCUPIED: "bg-ink-light/10 text-ink",
  MAINTENANCE: "bg-danger/10 text-danger",
};

export function UnitStatusSelect({
  unitId,
  currentStatus,
  action,
}: {
  unitId: string;
  currentStatus: "VACANT" | "OCCUPIED" | "MAINTENANCE";
  action: (unitId: string, status: "VACANT" | "OCCUPIED" | "MAINTENANCE") => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef}>
      <select
        name="status"
        defaultValue={currentStatus}
        disabled={isPending}
        onChange={(e) => {
          const value = e.target.value as "VACANT" | "OCCUPIED" | "MAINTENANCE";
          startTransition(() => action(unitId, value));
        }}
        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_STYLES[currentStatus]} ${
          isPending ? "opacity-50" : ""
        }`}
      >
        <option value="VACANT">Vacant</option>
        <option value="OCCUPIED">Occupied</option>
        <option value="MAINTENANCE">Maintenance</option>
      </select>
    </form>
  );
}
