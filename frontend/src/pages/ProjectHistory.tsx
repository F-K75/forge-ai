import { useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, GitBranch, RefreshCw, Zap } from "lucide-react";
import { BUILD_HISTORY, PROJECTS, type BuildRun } from "../lib/mockData";
import { AGENTS } from "../lib/agents";
import { StatusPill } from "../components/StatusPill";
import {
  AgentPipeline,
  type PipelineNode,
  type AgentState,
} from "../components/AgentPipeline";

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
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0];
  const [selectedId, setSelectedId] = useState<string>(BUILD_HISTORY[0].id);

  const selected = BUILD_HISTORY.find((b) => b.id === selectedId) ?? BUILD_HISTORY[0];
  const nodes = buildNodes(selected);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left: build timeline */}
      <aside
        aria-label="Build history"
        className="w-80 shrink-0 border-r border-border overflow-y-auto flex flex-col bg-panel"
      >
        {/* Project header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                project.live ? "bg-ok" : "bg-faint"
              }`}
              aria-label={project.live ? "Live" : "Idle"}
            />
            <span className="font-mono text-sm font-medium text-ink">
              {project.name}
            </span>
          </div>
          <p className="text-xs text-muted pl-3.5">
            {BUILD_HISTORY.length} builds ·{" "}
            {project.live ? "live" : "idle"}
          </p>
        </div>

        {/* Build list */}
        <nav aria-label="Builds" className="flex-1 p-2 overflow-y-auto">
          {BUILD_HISTORY.map((build) => {
            const isSelected = build.id === selectedId;
            return (
              <button
                key={build.id}
                onClick={() => setSelectedId(build.id)}
                aria-current={isSelected ? "true" : undefined}
                className={[
                  "w-full text-left px-3 py-3 rounded-lg mb-0.5 transition motion-reduce:transition-none",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isSelected
                    ? "bg-accent/[0.08] border border-accent/20"
                    : "border border-transparent hover:bg-panel-alt",
                ].join(" ")}
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
                    <span className="font-mono text-[10px] text-ok">
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
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right: build detail */}
      <main className="flex-1 overflow-y-auto p-6 bg-base">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-ink">
              {selected.label}
            </h2>
            <StatusPill status={selected.status} />
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel border border-border text-xs text-ink hover:bg-panel-alt transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
          >
            <GitBranch size={12} aria-hidden="true" />
            View diff
          </button>
        </div>

        {/* Summary chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
          <SummaryChip label="QA score" value={selected.qaScore !== null ? String(selected.qaScore) : "—"} />
          <SummaryChip label="Files changed" value={String(selected.filesChanged)} />
          <SummaryChip
            label="Credits"
            value={String(selected.credits)}
            icon={<Zap size={11} className="text-faint" aria-hidden="true" />}
          />
          <SummaryChip
            label="Debug loops"
            value={String(selected.debugLoops)}
            warn={selected.debugLoops > 0}
          />
        </div>

        {/* Pipeline run */}
        <section aria-label="Agent pipeline run">
          <h3 className="text-[10px] font-semibold text-faint uppercase tracking-wider mb-4">
            Pipeline run
          </h3>
          <div className="max-w-xs">
            <AgentPipeline nodes={nodes} />
          </div>
        </section>
      </main>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  icon,
  warn = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="bg-panel border border-border rounded-xl px-4 py-3">
      <p className="text-[10px] text-faint mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={`font-mono text-base font-bold ${
            warn ? "text-warn" : "text-ink"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
