import { PERMISSION_GROUPS } from "@/lib/permissions";

/** Grouped checkboxes (perm_<key>). `canGrant` disables permissions the editor doesn't hold. */
export function PermissionPicker({
  selected = [],
  canGrant,
}: {
  selected?: string[];
  canGrant: (permission: string) => boolean;
}) {
  const on = new Set(selected);
  return (
    <div className="flex flex-col gap-4">
      {PERMISSION_GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend className="text-xs font-medium uppercase tracking-wide text-muted">{g.title}</legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {g.items.map((p) => {
              const allowed = canGrant(p.key);
              return (
                <label key={p.key} className={`flex items-start gap-2 text-sm ${allowed ? "" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    name={`perm_${p.key}`}
                    defaultChecked={on.has(p.key)}
                    disabled={!allowed}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    {p.label}
                    {p.hint && <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">{p.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
