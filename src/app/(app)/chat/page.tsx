import { requireUser } from "@/lib/access";
import { recentChat, HELP, type ChatData } from "@/lib/chat";
import { ScrollToEnd } from "@/components/ScrollToEnd";
import { sendMessage, chooseOption, dismissOptions } from "./actions";

const SUGGESTIONS = ["Who owes rent?", "How are we doing this month?", "Help"];

export default async function ChatPage() {
  const user = await requireUser();
  const messages = await recentChat(user.orgId, user.id!);
  const lastApp = [...messages].reverse().find((m) => m.fromApp);

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <h1 className="font-serif text-2xl text-ink">Chat</h1>
      <p className="text-sm text-muted">Tell me what happened. I&apos;ll set it up and you tap to confirm.</p>

      <div className="mt-3 min-h-[50vh] space-y-2 rounded-lg bg-[#ece5dd] p-3">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <p className="max-w-[85%] whitespace-pre-line rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
              Hi {user.name?.split(" ")[0] ?? "there"} 👋{"\n\n"}{HELP}
            </p>
          </div>
        )}
        {messages.map((m) => {
          const data = m.data as ChatData | null;
          return (
            <div key={m.id} className={`flex ${m.fromApp ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.fromApp ? "bg-white" : "bg-[#dcf8c6]"}`}>
                <p className="whitespace-pre-line text-ink">{m.text}</p>
                {m.fromApp && data?.options && !m.resolved && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {data.options.map((o, i) => (
                      <form key={i} action={chooseOption}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="index" value={i} />
                        <button className="w-full rounded-full border border-accent px-3 py-2 text-left text-sm font-medium text-accent hover:bg-accent-light">
                          {data.options!.length === 1 ? "✓ Confirm: " : ""}{o.label}
                        </button>
                      </form>
                    ))}
                    <form action={dismissOptions}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="w-full rounded-full px-3 py-1.5 text-sm text-muted hover:underline">Cancel</button>
                    </form>
                  </div>
                )}
                {m.fromApp && data?.links && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {data.links.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        target={l.href.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="rounded-full bg-[#1f9d55] px-3 py-2 text-center text-sm font-medium text-white"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-right text-[10px] text-muted">
                  {m.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}
                </p>
              </div>
            </div>
          );
        })}
        <ScrollToEnd />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {!lastApp?.data && SUGGESTIONS.map((s) => (
          <form key={s} action={sendMessage}>
            <input type="hidden" name="text" value={s} />
            <button className="rounded-full border border-border bg-white px-3 py-1.5 text-xs text-ink">{s}</button>
          </form>
        ))}
      </div>

      <form action={sendMessage} className="sticky bottom-16 mt-2 flex gap-2 bg-white py-2 md:bottom-0">
        <input
          name="text"
          required
          maxLength={500}
          autoComplete="off"
          autoFocus
          placeholder='e.g. "John paid rent 25000 mpesa"'
          className="min-w-0 flex-1 rounded-full border border-border px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <button className="rounded-full bg-accent px-5 text-sm font-medium text-white">Send</button>
      </form>
    </div>
  );
}
