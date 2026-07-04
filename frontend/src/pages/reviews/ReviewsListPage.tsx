import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Send, ShieldCheck } from "lucide-react";
import { reviewsApi } from "../../lib/orchestratorApi";
import { formatRelativeTime } from "../../lib/format";
import { StatusPill } from "../../components/StatusPill";

interface ReviewRunSummary {
  run_id: string;
  created_at: string;
  repo_path: string;
  mode: "full" | "diff";
  status: "pending" | "running" | "consolidating" | "complete" | "failed";
  triggered_agents: string[];
  consolidated?: { overall_score: number; recommendation: string } | null;
}

export default function ReviewsListPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<ReviewRunSummary[] | null>(null);
  const [repoPath, setRepoPath] = useState("/workspaces/forge-ai");
  const [mode, setMode] = useState<"full" | "diff">("full");
  const [diff, setDiff] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    reviewsApi
      .list()
      .then((data) => setRuns(data.items))
      .catch(() => toast.error("Failed to load review runs"));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    const trimmedPath = repoPath.trim();
    if (!trimmedPath) {
      toast.error("Repo path is required");
      return;
    }
    if (mode === "diff" && !diff.trim()) {
      toast.error("Diff mode requires a non-empty diff");
      return;
    }

    setCreating(true);
    try {
      const res = await reviewsApi.create({
        repo_path: trimmedPath,
        mode,
        diff: mode === "diff" ? diff : undefined,
      });
      navigate(`/reviews/${res.run_id}`);
    } catch {
      toast.error("Failed to start review");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-6 md:px-10 py-10 md:py-14 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
        <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
        Review board
      </div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <ShieldCheck size={20} className="text-ink" aria-hidden="true" />
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">Review board</h1>
      </div>
      <p className="text-sm text-muted mb-10 max-w-2xl leading-relaxed">
        Multi-agent code review — audits a repo snapshot and produces a prioritized backlog. Read-only: it never
        edits, commits, or deploys.
      </p>

      {/* New review form */}
      <section className="border border-border rounded-lg p-6 mb-12">
        <h2 className="font-display text-base font-medium text-ink mb-5">New review</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
          <div>
            <label htmlFor="repo_path" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">
              Repo path
            </label>
            <input
              id="repo_path"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/workspaces/forge-ai"
              className="w-full h-11 px-3 rounded-md bg-transparent border border-border text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
            />
          </div>
          <div className="flex gap-2">
            {(["full", "diff"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  "h-11 px-4 rounded-md text-sm font-medium capitalize border transition-colors motion-reduce:transition-none",
                  mode === m ? "border-ink text-ink" : "border-border text-muted hover:text-ink",
                ].join(" ")}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === "diff" && (
          <div className="mt-4">
            <label htmlFor="diff" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">
              Diff
            </label>
            <textarea
              id="diff"
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
              rows={6}
              placeholder="Paste a unified diff…"
              className="w-full px-3 py-2.5 rounded-md bg-transparent border border-border text-sm font-mono text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 transition-colors motion-reduce:transition-none disabled:opacity-50"
        >
          <Send size={14} aria-hidden="true" />
          {creating ? "Starting…" : "Start review"}
        </button>
      </section>

      {/* Run history */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-6">
        <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
        Recent runs
      </div>
      {runs === null ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-faint">No review runs yet — start one above.</p>
      ) : (
        <ul className="border-t border-border">
          {runs.map((run) => (
            <li key={run.run_id} className="border-b border-border">
              <button
                type="button"
                onClick={() => navigate(`/reviews/${run.run_id}`)}
                className="w-full text-left flex items-center justify-between gap-4 px-4 py-4 hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-mono text-ink truncate">{run.repo_path}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {run.mode} · {formatRelativeTime(run.created_at)} · {run.triggered_agents.length} agent
                    {run.triggered_agents.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {run.consolidated && (
                    <span className="font-mono text-xs text-muted">score {run.consolidated.overall_score}</span>
                  )}
                  <StatusPill status={run.status} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
