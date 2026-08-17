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
      <div className="flex h-full items-center justify-center text-sm text-faint">
        {rawBuilds === null ? "Loading build history" : "No builds yet for this project."}
      </div>
    );
  }

  const nodes = buildNodes(selected);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left: build timeline */}
      <motion.aside
        aria-label="Build history"
        className="w-80 shrink-0 overflow-y-auto flex flex-col glass-strong"
        initial={reduceMotion ? false : { opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Project header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                projectLive ? "bg-accent" : "bg-faint"
              }`}
              aria-label={projectLive ? "Live" : "Idle"}
            />
            <span className="font-mono text-sm font-medium text-ink">
              {projectName}
            </span>
          </div>
          <p className="text-xs text-muted pl-3.5">
            {builds.length} builds ·{" "}
            {projectLive ? "live" : "idle"}
          </p>
          <Link
            to={`/project/${projectId}/org`}
            className="text-xs text-muted hover:text-ink pl-3.5 mt-1 inline-block"
          >
            Engineering org →
          </Link>
        </div>

        {/* Build list */}
        <motion.nav
          aria-label="Builds"
          className="flex-1 p-2 overflow-y-auto"
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
                  "w-full text-left px-3 py-3 border-l-2 mb-0.5 transition-colors motion-reduce:transition-none",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
                  isSelected
                    ? "border-ink bg-panel-alt"
                    : "border-transparent hover:bg-panel-alt",
                ].join(" ")}
                variants={motionVariants.staggerItem}
              >
                <p className="text-sm font-medium text-ink truncate mb-1.5">
                  {build.label}
                </p>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock size={10} aria-hidden="true" />
                    {build.time}
                  </span>
                  {build.qaScore !== null && (
                    <span className="font-mono text-[10px] text-muted">
                      QA {build.qaScore}
                    </span>
                  )}
                  {build.debugLoops > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-warn/10 text-warn">
                      <RefreshCw size={9} aria-hidden="true" />
                      {build.debugLoops}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </motion.nav>
      </motion.aside>

      {/* Right: build detail */}
      <motion.main
        className="flex-1 overflow-y-auto p-6 md:p-8 bg-base"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-xl font-medium tracking-tight text-ink">
              {selected.label}
            </h2>
            <StatusPill status={selected.status} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {LIVE_MODE && (
              <motion.button
                type="button"
                onClick={handleRollback}
                disabled={rollingBack}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-ink hover:bg-panel-alt active:scale-[0.98] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
                {...presets.button}
              >
                <RefreshCw size={12} aria-hidden="true" />
                {rollingBack ? "Rolling back" : "Roll back to this version"}
              </motion.button>
            )}
            {LIVE_MODE && (
              <motion.button
                type="button"
                onClick={handleViewDiff}
                disabled={diffLoading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-ink hover:bg-panel-alt active:scale-[0.98] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
                {...presets.button}
              >
                <GitBranch size={12} aria-hidden="true" />
                {diffLoading ? "Loading" : "View diff"}
              </motion.button>
            )}
          </div>
        </div>

        {/* Diff panel */}
        <AnimatePresence>
          {diff && (
            <motion.div
              key="diff-panel"
              className="mb-9 glass rounded-lg p-5"
              role="region"
              aria-label="Changed files"
              initial={reduceMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* A short summary announcement, not the full file list -- making
                  the whole region aria-live would read every filename aloud
                  the instant a large diff loads. */}
              <span role="status" aria-live="polite" className="sr-only">
                 {diff.added.length + diff.modified.length + diff.removed.length === 0
                   ? "No file changes from the previous build"
                   : `Diff loaded: ${diff.added.length + diff.modified.length + diff.removed.length} changed files`}
              </span>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs uppercase tracking-[0.14em] text-muted">Changed files</h3>
                <button
                  type="button"
                  onClick={() => setDiff(null)}
                  className="text-xs text-muted hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded"
                >
                  Close
                </button>
              </div>
              {diff.added.length === 0 && diff.modified.length === 0 && diff.removed.length === 0 ? (
                 <p className="text-xs text-faint">No file changes from the previous build.</p>
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

        {/* Summary chips */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-9"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          <motion.div variants={motionVariants.staggerItem}>
            <SummaryChip label="QA score" value={selected.qaScore !== null ? String(selected.qaScore) : "—"} />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <SummaryChip label="Files changed" value={String(selected.filesChanged)} />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <SummaryChip
              label="Credits"
              value={String(selected.credits)}
              icon={<Zap size={11} className="text-faint" aria-hidden="true" />}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <SummaryChip
              label="Debug loops"
              value={String(selected.debugLoops)}
              warn={selected.debugLoops > 0}
            />
          </motion.div>
        </motion.div>

        {/* Pipeline run */}
        <motion.section
          aria-label="Agent pipeline run"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-5">
            <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
            Pipeline run
          </div>
          <div className="max-w-xs">
            <AgentPipeline nodes={nodes} />
          </div>
        </motion.section>
      </motion.main>
    </div>
  );
}
