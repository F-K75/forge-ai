import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Send, Loader2 } from "lucide-react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { formatRelativeTime } from "../../lib/format";
import { StatusPill } from "../../components/StatusPill";

interface Initiative {
  id: string;
  name: string;
  prompt: string;
  status: string;
  vision?: string;
  updated_at?: string;
  created_at?: string;
}

const STATUS_MAP: Record<string, "complete" | "running" | "failed" | "pending"> = {
  draft: "pending",
  generating: "running",
  active: "complete",
  completed: "complete",
  archived: "pending",
  failed: "failed",
};

export default function InitiativesListPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);

  const load = () => {
    if (!LIVE_MODE) return;
    initiativesApi
      .list()
      .then(setInitiatives)
      .catch(() => toast.error("Failed to load initiatives"));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (!LIVE_MODE) {
      toast.error("Connect a backend (VITE_WS_URL) to use Initiatives");
      return;
    }
    setCreating(true);
    try {
      const initiative = await initiativesApi.create({ prompt: trimmed });
      navigate(`/initiatives/${initiative.id}`);
    } catch {
      toast.error("Failed to create initiative");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-6 md:px-10 py-10 md:py-14 max-w-5xl mx-auto">
      <header className="mb-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
          <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
          Engineering OS
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">Initiatives</h1>
        <p className="text-sm text-muted mt-2">
          Describe an idea. AI generates the vision, PRD, epics, stories, tasks, and sprint plan.
        </p>
      </header>

      <section aria-label="Start a new initiative" className="mb-16 pb-16 border-b border-border">
        <h2 className="font-display text-xl font-medium text-ink mb-1.5">What are you building?</h2>
        <p className="text-sm text-muted mb-6">Forge plans the whole engineering lifecycle end-to-end.</p>

        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="An AI CRM for startups…"
            className="flex-1 h-11 bg-transparent border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition min-w-0"
            aria-label="Describe what you want to build"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 h-11 px-5 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none shrink-0 disabled:opacity-50"
          >
            {creating ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
            {creating ? "Planning…" : "Generate plan"}
          </button>
        </div>
      </section>

      <section aria-label="Existing initiatives">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
            <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
            Your initiatives
          </div>
        </div>

        {!LIVE_MODE ? (
          <p className="text-sm text-faint">Connect a backend (set VITE_WS_URL) to load and create initiatives.</p>
        ) : initiatives === null ? (
          <p className="text-sm text-faint">Loading…</p>
        ) : initiatives.length === 0 ? (
          <p className="text-sm text-faint">No initiatives yet — describe an idea above to generate your first plan.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
            {initiatives.map(initiative => (
              <article key={initiative.id} className="bg-base">
                <button
                  onClick={() => navigate(`/initiatives/${initiative.id}`)}
                  className="w-full h-full text-left p-6 hover:bg-panel-alt focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-sm text-ink truncate">{initiative.name}</span>
                    <span className="text-[11px] text-faint shrink-0">
                      {formatRelativeTime(initiative.updated_at ?? initiative.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted mb-4 leading-relaxed line-clamp-2">
                    {initiative.vision || initiative.prompt}
                  </p>
                  <StatusPill status={STATUS_MAP[initiative.status] ?? "pending"} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
