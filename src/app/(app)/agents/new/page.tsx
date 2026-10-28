import { requirePermission } from "@/lib/access";
import { createAgent } from "../actions";
import { AgentFields } from "../_form";

export default async function NewAgentPage() {
  await requirePermission("agents.manage");
  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl text-ink">Add an agent</h1>
      <p className="mt-1 text-sm text-muted">Someone who brings you tenants and earns a commission.</p>
      <form action={createAgent} className="mt-6 flex flex-col gap-4">
        <AgentFields agent={null} />
        <button className="self-start rounded bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-light">Save agent</button>
      </form>
    </div>
  );
}
