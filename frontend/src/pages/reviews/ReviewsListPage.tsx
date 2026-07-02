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
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-accent" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-ink">Review board</h1>
      </div>
      <p className="text-sm text-muted mb-8">
        Multi-agent code review — audits a repo snapshot and produces a prioritized backlog. Read-only: it never
        edits, commits, or deploys.
      </p>

      {/* New review form */}
      <section className="bg-panel border border-border rounded-xl p-5 mb-8">
        <h2 className="text-sm font-semibold text-ink mb-4">New review</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
          <div>
            <label htmlFor="repo_path" className="block text-xs text-faint mb-1.5">
              Repo path
            </label>
            <input
              id="repo_path"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/workspaces/forge-ai"
              className="w-full h-10 px-3 rounded-lg bg-panel-alt border border-border text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <div className="flex gap-2">
            {(["full", "diff"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  "h-10 px-4 rounded-lg text-sm font-medium capitalize transition motion-reduce:transition-none",
                  mode === m ? "bg-accent-soft text-accent border border-accent/30" : "bg-panel-alt text-muted border border-border hover:text-ink",
                ].join(" ")}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === "diff" && (
          <div className="mt-4">
            <label htmlFor="diff" className="block text-xs text-faint mb-1.5">
              Diff
            </label>
            <textarea
              id="diff"
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
              rows={6}
              placeholder="Paste a unified diff…"
              className="w-full px-3 py-2 rounded-lg bg-panel-alt border border-border text-sm font-mono text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition motion-reduce:transition-none disabled:opacity-50"
        >
          <Send size={14} aria-hidden="true" />
          {creating ? "Starting…" : "Start review"}
        </button>
      </section>

      {/* Run history */}
      <h2 className="text-[10px] font-semibold text-faint uppercase tracking-wider mb-3">Recent runs</h2>
      {runs === null ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-faint">No review runs yet — start one above.</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.run_id}>
              <button
                type="button"
                onClick={() => navigate(`/reviews/${run.run_id}`)}
                className="w-full text-left flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-panel border border-border hover:bg-panel-alt transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
