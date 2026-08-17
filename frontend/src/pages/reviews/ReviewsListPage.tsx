import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Send, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { motionVariants } from "../../lib/animations";
import { reviewsApi } from "../../lib/orchestratorApi";
import { formatRelativeTime } from "../../lib/format";
import { StatusPill } from "../../components/StatusPill";
import { EmptyState, SkeletonList } from "../../components/ui/EmptyState";
import { Card, Button, Heading } from "../../components/ui";
import { layout } from "../../lib/designTokens";

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
  const reduceMotion = useReducedMotion();
  const [runs, setRuns] = useState<ReviewRunSummary[] | null>(null);
  const [repoPath, setRepoPath] = useState("/workspaces/forge-ai");
  const [mode, setMode] = useState<"full" | "diff">("full");
  const [diff, setDiff] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = () => {
    reviewsApi
      .list()
      .then((data) => setRuns(data.items))
      .catch(() => toast.error("Couldn't load reviews. Please try again."));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    const trimmedPath = repoPath.trim();
    if (!trimmedPath) {
      toast.error("Enter a repo path to start a review");
      return;
    }
    if (mode === "diff" && !diff.trim()) {
      toast.error("Diff mode needs a non-empty diff");
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
      toast.error("Couldn't start the review. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      className="mx-auto max-w-5xl px-4 py-6 md:px-8"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="mb-6">
        <Heading level="h2">Code Reviews</Heading>
        <Heading level="body" className="mt-1 max-w-2xl">
          Multi-agent code review — audits a repo snapshot and produces a prioritized backlog. Read-only: it never
          edits, commits, or deploys.
        </Heading>
      </header>

      {/* New review form */}
      <Card variant="panel" className="mb-8">
        <Heading level="h3" className="mb-4">
          New review
        </Heading>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
          <div>
            <label htmlFor="repo_path" className="mb-2 block text-xs uppercase tracking-wide text-muted">
              Repo path
            </label>
            <input
              id="repo_path"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/workspaces/forge-ai"
              className="h-10 w-full border border-border bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              style={{ borderRadius: layout.radiusSm }}
            />
          </div>
          <div className="flex gap-2">
            {(["full", "diff"] as const).map((m) => (
              <Button
                key={m}
                variant="secondary"
                size="md"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={mode === m ? "border-accent text-ink" : ""}
              >
                {m === "full" ? "Full review" : "Diff"}
              </Button>
            ))}
          </div>
        </div>

        {mode === "diff" && (
          <div className="mt-4">
            <label htmlFor="diff" className="mb-2 block text-xs uppercase tracking-wide text-muted">
              Diff
            </label>
            <textarea
              id="diff"
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
              rows={6}
              placeholder="Paste a unified diff…"
              className="w-full border border-border bg-transparent px-3 py-3 font-mono text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              style={{ borderRadius: layout.radiusSm }}
            />
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          onClick={handleCreate}
          disabled={creating}
          className="mt-4"
        >
          <Send size={14} aria-hidden="true" />
          {creating ? "Starting…" : "Start review"}
        </Button>
      </Card>

      {/* Run history */}
      <div className="mb-6 flex items-center gap-2">
        <span className="h-px w-6 bg-muted/50" aria-hidden="true" />
        <Heading level="label">Recent runs</Heading>
      </div>
      {runs === null ? (
        <SkeletonList count={4} />
      ) : runs.length === 0 ? (
        <Card variant="empty-state" className="p-0">
          <EmptyState
            icon={ShieldCheck}
            title="No review runs yet"
            description="Start one above to review a PR or commit."
            primaryAction={{ label: creating ? "Starting…" : "Start review", onClick: handleCreate }}
          />
        </Card>
      ) : (
        <motion.ul
          className="flex flex-col gap-2"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {runs.map((run) => (
            <motion.li key={run.run_id} variants={motionVariants.staggerItem}>
              <Card variant="content" className="p-0">
                <button
                  type="button"
                  onClick={() => navigate(`/reviews/${run.run_id}`)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-panel-alt motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-ink">{run.repo_path}</p>
                    <p className="mt-1 text-xs text-muted">
                      {run.mode} · {formatRelativeTime(run.created_at)} · {run.triggered_agents.length} agent
                      {run.triggered_agents.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {run.consolidated && (
                      <span className="font-mono text-xs text-muted">score {run.consolidated.overall_score}</span>
                    )}
                    <StatusPill status={run.status} />
                  </div>
                </button>
              </Card>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </motion.div>
  );
}
