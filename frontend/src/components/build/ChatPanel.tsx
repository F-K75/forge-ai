import { useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";
import { AgentPipeline, type PipelineNode } from "../AgentPipeline";
import { AGENTS } from "../../lib/agents";

export function ChatPanel({ onSubmit }: { onSubmit: (prompt: string) => void | Promise<void> }) {
  const messages = useBuildStore((s) => s.messages);
  const agentStates = useBuildStore((s) => s.agentStates);
  const status = useBuildStore((s) => s.status);

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const nodes: PipelineNode[] = AGENTS.map((a) => ({
    id: a.id,
    state: agentStates[a.id] ?? "idle",
  }));

  const busy = status === "running" || status === "debugging" || submitting;

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || busy || isOffline) return;
    setDraft("");
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-panel border-r border-border">
      <div className="px-4 py-3 border-b border-border-soft">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint mb-3">Pipeline</h2>
        <AgentPipeline nodes={nodes} compact />
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-faint">
            Describe what you want to build and the agents will take it from there.
          </p>
        )}
        {messages.map((msg, i) =>
          msg.from === "user" ? (
            <div key={i} className="ml-6 px-3 py-2 rounded-lg bg-accent-soft text-sm text-ink">
              {msg.text}
            </div>
          ) : (
            <div key={i} className="text-xs text-muted leading-relaxed">
              {msg.text}
            </div>
          )
        )}
      </div>

      {isOffline && (
        <div role="status" className="mx-3 mb-2 px-3 py-2 rounded-lg bg-warn/10 border border-warn/30 text-warn text-xs">
          You're offline — reconnect to keep building.
        </div>
      )}

      <form
        className="p-3 border-t border-border-soft"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder={isOffline ? "You're offline…" : busy ? "Build in progress…" : "Describe your app…"}
            disabled={busy || isOffline}
            aria-label="Build prompt"
            className="w-full resize-none rounded-lg bg-panel-alt border border-border px-3 py-2 pr-9 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || isOffline || !draft.trim()}
            aria-label="Send prompt"
            className="absolute right-2 bottom-2.5 p-1.5 rounded-md bg-accent text-white disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            <CornerDownLeft size={13} aria-hidden="true" />
          </button>
        </div>
      </form>
    </aside>
  );
}
