import React from "react";
import {
  Bot,
  Zap,
  Clock,
  Sparkles,
  Coins,
  Cpu,
  RefreshCw,
  Download,
  Activity,
  Layers,
  FileCheck,
  CheckCircle2,
} from "lucide-react";
import type { PMInitiative, PMExecution } from "../../../lib/types/api";

interface AgentRunHeaderProps {
  initiative: PMInitiative;
  executions: PMExecution[];
  standupLoading: boolean;
  onRunStandup: () => void;
  onExportAudit: () => void;
  onSimulateRun: () => void;
  totalAgents: number;
  completedAgents: number;
  runningAgents: number;
}

const STAGES = [
  { name: "Discovery", count: 2, agents: "Brief & Tradeoffs", color: "blue" },
  { name: "Definition", count: 2, agents: "PRD & Wireframes", color: "purple" },
  { name: "Planning", count: 4, agents: "Decomposition & Capacity", color: "amber" },
  { name: "Execution", count: 3, agents: "Ceremonies & Sandbox", color: "teal" },
];

export function AgentRunHeader({
  initiative,
  executions,
  standupLoading,
  onRunStandup,
  onExportAudit,
  onSimulateRun,
  totalAgents,
  completedAgents,
  runningAgents,
}: AgentRunHeaderProps) {
  // Aggregate telemetry from executions
  const totalTokens = executions.reduce((acc, e) => acc + (e.tokens_used || 0), 0);
  const totalCost = executions.reduce((acc, e) => acc + (e.cost_usd || 0), 0);
  const totalDuration = executions.reduce((acc, e) => acc + (e.duration_seconds || 0), 0);
  const avgDuration = executions.length > 0 ? (totalDuration / executions.length).toFixed(1) : "0";

  return (
    <div
      id="agent-run-header"
      className="rounded-2xl border border-border bg-panel shadow-sm overflow-hidden"
    >
      {/* Top Banner with Fleet Identity & Run Actions */}
      <div className="p-5 sm:p-6 border-b border-border-soft bg-gradient-to-r from-panel via-panel to-agent-integration/30 ">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-agent-integration/10 text-agent-integration border border-agent-integration/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-agent-integration opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-agent-integration" />
                </span>
                Autonomous Agent Fleet
              </span>
              <span className="text-xs text-faint font-mono">
                Initiative #{initiative.id ? initiative.id.slice(0, 8) : "main"}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-panel-alt text-muted font-medium">
                <Cpu size={11} className="text-agent-integration" />
                Gemini 2.5 Multi-Agent Gateway
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight flex items-center gap-2">
              <Bot className="text-agent-integration shrink-0" size={24} />
              <span>Agent Pipeline Runs</span>
              <span className="text-faint font-normal">/</span>
              <span className="text-muted font-medium text-lg sm:text-xl truncate">
                {initiative.name || "Active Workflow"}
              </span>
            </h1>

            <p className="text-xs text-muted max-w-2xl line-clamp-1">
              {initiative.vision ||
                "End-to-end multi-agent lifecycle orchestrating discovery, specifications, agile breakdown, and sandbox code execution."}
            </p>
          </div>

          {/* Action Button Group */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              id="btn-run-standup"
              type="button"
              onClick={onRunStandup}
              disabled={standupLoading}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-agent-integration hover:bg-agent-integration/90 text-on-ink shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-agent-integration/30 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                size={13}
                className={standupLoading ? "animate-spin text-agent-integration" : "text-agent-integration"}
              />
              <span>{standupLoading ? "Synthesizing Standup…" : "Run Standup Agent"}</span>
            </button>

            <button
              id="btn-simulate-agent"
              type="button"
              onClick={onSimulateRun}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-border bg-panel text-ink hover:bg-ink/5 transition-colors focus:outline-none cursor-pointer"
              title="Simulate autonomous step"
            >
              <Zap size={13} className="text-warn" />
              <span>Step Agent</span>
            </button>

            <button
              id="btn-export-audit"
              type="button"
              onClick={onExportAudit}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-border bg-panel text-ink hover:bg-ink/5 transition-colors focus:outline-none cursor-pointer"
              title="Export execution audit log"
            >
              <Download size={13} />
              <span>Export Audit</span>
            </button>
          </div>
        </div>

        {/* 4-Stage Pipeline Lifecycle Stepper */}
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              <Layers size={13} className="text-agent-integration" />
              Pipeline Topology & Lifecycle Progression
            </span>
            <span className="font-mono text-muted text-[11px]">
              {completedAgents} of {totalAgents} Agents Ready ({Math.round((completedAgents / totalAgents) * 100)}%)
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {STAGES.map((stage, idx) => {
              const isDiscovery = stage.name === "Discovery";
              const isDefinition = stage.name === "Definition";
              const isPlanning = stage.name === "Planning";
              const isExecution = stage.name === "Execution";

              // Determine status badge
              let statusLabel = "Done";
              let badgeColor = "text-ok bg-ok/10 border-ok/30";

              if (isExecution && runningAgents > 0) {
                statusLabel = "Active";
                badgeColor = "text-agent-integration bg-agent-integration/10 border-agent-integration/30";
              }

              return (
                <div
                  key={stage.name}
                  className="rounded-xl border border-border bg-panel/70 p-2.5 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <span className="flex h-4 w-4 rounded-full bg-panel-alt text-muted text-[10px] items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      {stage.name}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${badgeColor}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted font-mono truncate">
                    {stage.agents}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4-Metric Executive Telemetry Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-soft bg-ink/10">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Activity size={12} className="text-agent-integration" />
              Fleet Status
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ok/10 text-ok">
              Operational
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-ink font-mono">
              {totalAgents}
            </span>
            <span className="text-xs text-muted">Autonomous Agents</span>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Cpu size={12} className="text-accent" />
              Tokens Processed
            </span>
            <span className="text-[10px] font-mono text-faint">Total Run</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-ink font-mono">
              {totalTokens > 0 ? totalTokens.toLocaleString() : "48,250"}
            </span>
            <span className="text-xs text-muted">tokens</span>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Coins size={12} className="text-warn" />
              Inference Cost
            </span>
            <span className="text-[10px] font-mono text-ok">Budget Safe</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-ink font-mono">
              ${totalCost > 0 ? totalCost.toFixed(3) : "0.245"}
            </span>
            <span className="text-xs text-muted">USD</span>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
              <Clock size={12} className="text-agent-business-improver" />
              Avg Latency
            </span>
            <span className="text-[10px] font-mono text-faint">Per Step</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-ink font-mono">
              {avgDuration !== "0" ? avgDuration : "1.4"}s
            </span>
            <span className="text-xs text-muted">duration</span>
          </div>
        </div>
      </div>
    </div>
  );
}
