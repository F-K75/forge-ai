import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Clock, GitBranch, RefreshCw, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { motionVariants } from "../lib/animations";
import { presets } from "../lib/animationPresets";
import { BUILD_HISTORY, PROJECTS, type BuildRun } from "../lib/mockData";
import { AGENTS, type Agent } from "../lib/agents";
import { LIVE_MODE } from "../lib/env";
import { projectsApi, buildsApi } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import { SummaryChip } from "../components/SummaryChip";
import {
  AgentPipeline,
  type PipelineNode,
  type AgentState,
} from "../components/AgentPipeline";

const KNOWN_AGENT_IDS = new Set(AGENTS.map((a) => a.id as string));

interface RawAgentStep {
  agent: string;
  status: string;
  files_changed?: string[];
  output?: string;
}

interface RawBuild {
  id: string;
  project_id: string;
  prompt: string;
  status: string;
  agents: RawAgentStep[];
  credits_used: number;
  debug_iterations: number;
  created_at: string;
}

function extractQaScore(agents: RawAgentStep[]): number | null {
  for (let i = agents.length - 1; i >= 0; i--) {
    const step = agents[i];
    if (step.agent !== "pm" || !step.output) continue;
    try {
      const parsed = JSON.parse(step.output);
      if (typeof parsed.score === "number") return parsed.score;
    } catch {
      // malformed PM output — skip
    }
  }
  return null;
}

function toBuildRun(raw: RawBuild): BuildRun {
  const ranAgentIds = Array.from(new Set(raw.agents.map((a) => a.agent))).filter((id) =>
    KNOWN_AGENT_IDS.has(id)
  ) as Agent["id"][];

  const filesChanged = new Set<string>();
  for (const step of raw.agents) {
    for (const f of step.files_changed ?? []) filesChanged.add(f);
  }

  let status: BuildRun["status"] = "debugging";
  if (raw.status === "success") status = "complete";
  else if (raw.status === "failed") status = "failed";

  return {
    id: raw.id,
    label: raw.prompt?.trim() ? raw.prompt.slice(0, 60) : "Untitled build",
    time: formatRelativeTime(raw.created_at),
    status,
    qaScore: extractQaScore(raw.agents),
    credits: raw.credits_used,
    agents: ranAgentIds,
    filesChanged: filesChanged.size,
    debugLoops: raw.debug_iterations,
  };
}

function buildNodes(build: BuildRun): PipelineNode[] {
  return AGENTS.map((agent) => {
    const ran = build.agents.includes(agent.id);
    if (!ran) return { id: agent.id, state: "idle" as AgentState };
    if (agent.id === "developer" && build.debugLoops > 0) {
      return {
        id: agent.id,
        state: "debugging" as AgentState,
        detail: `retried ${build.debugLoops}× to fix validation errors`,
        showCredits: true,
      };
    }
    return { id: agent.id, state: "done" as AgentState, showCredits: true };
  });
}

export default function ProjectHistory() {
  const { projectId } = useParams<{ projectId: string }>();
  const reduceMotion = useReducedMotion();

  const mockProject = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0];

  const [liveProjectName, setLiveProjectName] = useState<string | null>(null);
  const [rawBuilds, setRawBuilds] = useState<RawBuild[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [diff, setDiff] = useState<{ added: string[]; modified: string[]; removed: string[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const refreshBuilds = () => {
    if (!LIVE_MODE || !projectId) return;
    projectsApi
      .getBuilds(projectId)
      .then((data: RawBuild[]) => {
        setRawBuilds(data);
        setSelectedId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => toast.error("Couldn't load build history."));
  };

  useEffect(() => {
    if (!LIVE_MODE || !projectId) return;
    projectsApi
      .get(projectId)
      .then((p) => setLiveProjectName(p.name))
      .catch(() => {
        // Previously silent (PROD-016) -- see the identical fix in
        // WorkspacePage.tsx.
        toast.error("Couldn't load this project.");
        setLiveProjectName("Unknown project");
      });
    refreshBuilds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    setDiff(null);
  }, [selectedId]);

  const builds: BuildRun[] = LIVE_MODE ? (rawBuilds ?? []).map(toBuildRun) : BUILD_HISTORY;
  const selected = builds.find((b) => b.id === selectedId) ?? builds[0];

  const projectName = LIVE_MODE ? liveProjectName ?? "Loading…" : mockProject.name;
  const projectLive = LIVE_MODE ? true : mockProject.live;

  // Backend rollback takes a "version" index into builds sorted oldest-first;
  // the API returns newest-first, so reverse before looking up the index.
  const ascendingBuilds = useMemo(() => [...(rawBuilds ?? [])].reverse(), [rawBuilds]);

  const handleRollback = async () => {
    if (!LIVE_MODE || !selected) return;
    const version = ascendingBuilds.findIndex((b) => b.id === selected.id);
    if (version < 0) return;

    setRollingBack(true);
    try {
      await buildsApi.rollback(selected.id, version);
      toast.success("Rolled back — a new build was created from that version");
      refreshBuilds();
    } catch {
      toast.error("Rollback failed. Please try again.");
    } finally {
      setRollingBack(false);
    }
  };

  const handleViewDiff = async () => {
    if (!LIVE_MODE || !selected) return;
    const selectedIndex = ascendingBuilds.findIndex((b) => b.id === selected.id);
    const previous = selectedIndex > 0 ? ascendingBuilds[selectedIndex - 1] : null;

    setDiffLoading(true);
    try {
      const [currentFiles, previousFiles] = await Promise.all([
        buildsApi.getFiles(selected.id) as Promise<Record<string, string>>,
        previous
          ? (buildsApi.getFiles(previous.id) as Promise<Record<string, string>>)
          : Promise.resolve({} as Record<string, string>),
      ]);
      const added = Object.keys(currentFiles).filter((f) => !(f in previousFiles));
      const removed = Object.keys(previousFiles).filter((f) => !(f in currentFiles));
      const modified = Object.keys(currentFiles).filter(
        (f) => f in previousFiles && previousFiles[f] !== currentFiles[f]
      );
      setDiff({ added, modified, removed });
    } catch {
      toast.error("Couldn't load the diff.");
    } finally {
      setDiffLoading(false);
    }
  };

  if (LIVE_MODE && !selected) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-base text-sm text-muted">
        {rawBuilds === null ? "Loading build history…" : "No builds yet for this project."}
      </div>
    );
  }

  const nodes = buildNodes(selected);

  return (
    <div className="flex h-full min-h-[calc(100vh-56px)] overflow-hidden bg-base text-ink">
      {/* Left: Build Timeline Sidebar */}
      <motion.aside
        aria-label="Build history"
        className="w-80 shrink-0 overflow-y-auto flex flex-col bg-panel border-r border-border"
        initial={reduceMotion ? false : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {/* Project Header */}
        <div className="px-5 py-4 border-b border-border shrink-0 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                projectLive ? "bg-ok" : "bg-faint"
              }`}
              aria-label={projectLive ? "Live" : "Idle"}
            />
            <span className="font-display text-sm font-semibold text-ink truncate">
              {projectName}
            </span>
          </div>
          <p className="text-xs font-mono text-muted pl-3.5 tabular-nums">
            {builds.length} builds · {projectLive ? "live" : "idle"}
          </p>
          <Link
            to={`/project/${projectId}/org`}
            className="text-xs text-accent hover:underline pl-3.5 pt-0.5 inline-block"
          >
            Engineering org →
          </Link>
        </div>

        {/* Build List */}
        <motion.nav
          aria-label="Builds"
          className="flex-1 p-2.5 space-y-1 overflow-y-auto"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {builds.map((build) => {
            const isSelected = build.id === selected.id;
            return (
              <motion.button
                key={build.id}
                onClick={() => setSelectedId(build.id)}
                aria-current={isSelected ? "true" : undefined}
                className={[
                  "w-full text-left px-3 py-2.5 rounded-lg border transition-colors duration-150 motion-reduce:transition-none cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  isSelected
                    ? "bg-accent-soft border-accent/40 text-ink"
                    : "border-transparent hover:bg-panel-alt text-ink",
                ].join(" ")}
                variants={motionVariants.staggerItem}
              >
                <p className="text-sm font-medium text-ink truncate mb-1">
                  {build.label}
                </p>
                <div className="flex items-center gap-3 flex-wrap text-xs font-mono tabular-nums text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} aria-hidden="true" />
                    {build.time}
                  </span>
                  {build.qaScore !== null && <span>QA {build.qaScore}</span>}
                  {build.debugLoops > 0 && (
                    <span className="inline-flex items-center gap-1 text-warn">
                      <RefreshCw size={10} aria-hidden="true" />
                      {build.debugLoops}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </motion.nav>
      </motion.aside>

      {/* Right: Build Detail Stage */}
      <motion.main
        className="flex-1 overflow-y-auto p-6 md:p-8 bg-base"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className="max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
                {selected.label}
              </h1>
              <StatusPill status={selected.status} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {LIVE_MODE && (
                <motion.button
                  type="button"
                  onClick={handleRollback}
                  disabled={rollingBack}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-panel text-xs font-medium text-ink hover:bg-panel-alt transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 cursor-pointer"
                  {...presets.button}
                >
                  <RefreshCw size={12} aria-hidden="true" />
                  {rollingBack ? "Rolling back…" : "Roll back to this version"}
                </motion.button>
              )}
              {LIVE_MODE && (
                <motion.button
                  type="button"
                  onClick={handleViewDiff}
                  disabled={diffLoading}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-ink hover:bg-ink/90 text-xs font-medium text-on-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 cursor-pointer"
                  {...presets.button}
                >
                  <GitBranch size={12} aria-hidden="true" />
                  {diffLoading ? "Loading…" : "View diff"}
                </motion.button>
              )}
            </div>
          </div>

          {/* Diff Panel */}
          <AnimatePresence>
            {diff && (
              <motion.div
                key="diff-panel"
                className="rounded-xl border border-border bg-panel p-5 shadow-apple"
                role="region"
                aria-label="Changed files"
                initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <span role="status" aria-live="polite" className="sr-only">
                  {diff.added.length + diff.modified.length + diff.removed.length === 0
                    ? "No file changes from the previous build"
                    : `Diff loaded: ${diff.added.length + diff.modified.length + diff.removed.length} changed files`}
                </span>
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-border">
                  <h3 className="text-xs font-semibold text-ink">Changed files</h3>
                  <button
                    type="button"
                    onClick={() => setDiff(null)}
                    className="text-xs text-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                {diff.added.length === 0 && diff.modified.length === 0 && diff.removed.length === 0 ? (
                  <p className="text-xs text-muted">No file changes from the previous build.</p>
                ) : (
                  <ul className="space-y-1 font-mono text-xs">
                    {diff.added.map((f) => (
                      <li key={`a-${f}`} className="text-ok">+ {f}</li>
                    ))}
                    {diff.modified.map((f) => (
                      <li key={`m-${f}`} className="text-warn">~ {f}</li>
                    ))}
                    {diff.removed.map((f) => (
                      <li key={`r-${f}`} className="text-error">− {f}</li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Summary KPI Strip */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
              <SummaryChip label="QA score" value={selected.qaScore !== null ? String(selected.qaScore) : "—"} />
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
              <SummaryChip label="Files changed" value={String(selected.filesChanged)} />
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
              <SummaryChip
                label="Credits"
                value={String(selected.credits)}
                icon={<Zap size={12} className="text-accent" aria-hidden="true" />}
              />
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
              <SummaryChip
                label="Debug loops"
                value={String(selected.debugLoops)}
                warn={selected.debugLoops > 0}
              />
            </motion.div>
          </motion.div>

          {/* Pipeline Run */}
          <motion.section
            aria-label="Agent pipeline run"
            className="rounded-xl border border-border bg-panel p-5 shadow-apple"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
          >
            <h3 className="font-display text-sm font-semibold text-ink mb-4">
              Agent Pipeline Run
            </h3>
            <div className="max-w-sm">
              <AgentPipeline nodes={nodes} />
            </div>
          </motion.section>
        </div>
      </motion.main>
    </div>
  );
}
