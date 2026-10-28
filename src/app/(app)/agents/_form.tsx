type Agent = {
  name: string; phone: string | null; mpesaNumber: string | null; kind: string;
  basis: string; rate: { toString(): string }; notes: string | null; active: boolean;
} | null;

const input = "w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-ink";
const label = "mb-1 block text-xs font-medium text-muted";

export function AgentFields({ agent }: { agent: Agent }) {
  return (
    <>
      <div><label className={label}>Name</label><input name="name" required defaultValue={agent?.name} className={input} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label}>Phone</label><input name="phone" defaultValue={agent?.phone ?? ""} className={input} /></div>
        <div><label className={label}>M-Pesa number</label><input name="mpesaNumber" defaultValue={agent?.mpesaNumber ?? ""} className={input} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Type</label>
          <select name="kind" defaultValue={agent?.kind ?? "LEASING"} className={input}>
            <option value="LEASING">Leasing agent</option>
            <option value="REFERRAL">Referral</option>
          </select>
        </div>
        <div>
          <label className={label}>Commission is</label>
          <select name="basis" defaultValue={agent?.basis ?? "PERCENT_OF_FIRST_RENT"} className={input}>
            <option value="PERCENT_OF_FIRST_RENT">% of first month&apos;s rent</option>
            <option value="FLAT">A fixed amount (KES)</option>
          </select>
        </div>
        <div><label className={label}>Rate</label><input name="rate" type="number" min={0} step="0.01" required defaultValue={agent ? agent.rate.toString() : "50"} className={input} /></div>
      </div>
      <div><label className={label}>Notes</label><input name="notes" defaultValue={agent?.notes ?? ""} className={input} /></div>
      {agent && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="active" defaultChecked={agent.active} /> Active (can be chosen on new leases)
        </label>
      )}
    </>
  );
}
