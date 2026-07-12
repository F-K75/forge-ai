import { useEffect } from "react";
import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RefreshCw, Loader2 } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { usePMSocket } from "../../hooks/usePMSocket";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";

const TABS = [
  { to: "", label: "Overview", end: true },
  { to: "board", label: "Board" },
  { to: "sprints", label: "Sprints" },
  { to: "agent-runs", label: "Agent runs" },
  { to: "roadmap", label: "Roadmap" },
  { to: "graph", label: "Graph" },
  { to: "releases", label: "Releases" },
  { to: "activity", label: "Activity" },
];

export default function InitiativeLayout() {
  const { initiativeId } = useParams<{ initiativeId: string }>();
  const navigate = useNavigate();
  const { initiative, generationStatus, generationStage, hydrate, reset } = usePMStore();
  const { connectionStatus } = usePMSocket(LIVE_MODE ? initiativeId ?? null : null);

  useEffect(() => {
    if (!LIVE_MODE || !initiativeId) return;
    hydrate(initiativeId);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiativeId]);

  const handleRegenerate = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.regenerate(initiativeId);
      toast.success("Regenerating plan…");
    } catch {
      toast.error("Failed to start regeneration");
    }
  };

  if (!LIVE_MODE) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint p-8 text-center">
        Connect a backend (set VITE_WS_URL) to use Initiatives.
      </div>
    );
  }

  if (!initiative) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">Loading initiative…</div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-6 md:px-8 pt-6 pb-0 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <button
              onClick={() => navigate("/initiatives")}
              className="text-xs text-muted hover:text-ink transition-colors motion-reduce:transition-none mb-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded"
            >
              ← All initiatives
            </button>
            <h1 className="font-display text-xl md:text-2xl font-medium tracking-tight text-ink truncate">
              {initiative.name}
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${connectionStatus === "online" ? "bg-ok" : "bg-faint"}`}
              aria-label={`Live updates: ${connectionStatus}`}
              title={`Live updates: ${connectionStatus}`}
            />
            {generationStatus === "generating" ? (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                {generationStage ? `Generating ${generationStage}…` : "Generating…"}
              </span>
            ) : (
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-ink hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
              >
                <RefreshCw size={11} aria-hidden="true" />
                Regenerate
              </button>
            )}
          </div>
        </div>

        <nav aria-label="Initiative sections" className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  "px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors motion-reduce:transition-none",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
                  isActive ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                ].join(" ")
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
