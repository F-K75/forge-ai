import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Code2,
  Sparkles,
  Cpu,
  Clock,
  Coins,
  ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";
import type { GatewayAgent } from "../../../lib/gatewayAgents";

export type RunStatus = "running" | "needs_review" | "done" | "idle";

export interface SideMetric {
  label: string;
  value: string;
}

interface AgentRunCardProps {
  agent: GatewayAgent;
  runTitle: string;
  runMeta: string;
  status: RunStatus;
  statusLabel?: string;
  progressPct?: number;
  sideMetrics?: SideMetric[];
  sideAction?: React.ReactNode;
  modelName?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onInspectPayload?: () => void;
  rawPayload?: any;
  children: React.ReactNode;
}

const STAGE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Discovery: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800/50",
  },
  Definition: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800/50",
  },
  Planning: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/50",
  },
  Execution: {
    bg: "bg-teal-50 dark:bg-teal-950/40",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-200 dark:border-teal-800/50",
  },
};

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; badge: string; dot: string; pulse?: boolean }
> = {
  running: {
    label: "Running",
    badge: "bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60",
    dot: "bg-teal-500",
    pulse: true,
  },
  needs_review: {
    label: "Needs Review",
    badge: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
    dot: "bg-amber-500",
  },
  done: {
    label: "Completed",
    badge: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
  },
  idle: {
    label: "Standby",
    badge: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

export function AgentRunCard({
  agent,
  runTitle,
  runMeta,
  status,
  statusLabel,
  progressPct,
  sideMetrics = [],
  sideAction,
  modelName = "Gemini 2.5 Pro",
  isExpanded = true,
  onToggleExpand,
  onInspectPayload,
  rawPayload,
  children,
}: AgentRunCardProps) {
  const Icon = agent.icon;
  const [copied, setCopied] = useState(false);
  const stageTheme = STAGE_COLOR[agent.stage] || STAGE_COLOR.Discovery;
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.done;

  const handleCopy = () => {
    try {
      const textToCopy = rawPayload
        ? typeof rawPayload === "string"
          ? rawPayload
          : JSON.stringify(rawPayload, null, 2)
        : `${runTitle} - ${runMeta}`;
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success(`${agent.label} payload copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy payload");
    }
  };

  return (
    <div
      id={`agent-card-${agent.id}`}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700"
    >
      {/* Card Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Agent Icon + Name + Stage Pill + Model */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform"
              style={{ background: `${agent.hue}18`, color: agent.hue }}
            >
              <Icon size={18} aria-hidden="true" />
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-tight">
                  {agent.label}
                </h3>

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stageTheme.bg} ${stageTheme.text} ${stageTheme.border}`}
                >
                  {agent.stage}
                </span>

                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                  <Cpu size={10} className="text-teal-500" />
                  {modelName}
                </span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xl">
                {agent.purpose}
              </p>
            </div>
          </div>

          {/* Right: Status Pill + Action Controls */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {/* Status Pill */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusCfg.badge}`}
            >
              <span className="relative flex h-1.5 w-1.5">
                {statusCfg.pulse && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${statusCfg.dot}`} />
              </span>
              <span>{statusLabel || statusCfg.label}</span>
            </span>

            {/* Side Action (e.g. Run Standup) */}
            {sideAction && <div>{sideAction}</div>}

            {/* Copy Payload Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Copy output payload"
              aria-label={`Copy ${agent.label} output`}
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>

            {/* Inspect Payload Button */}
            {onInspectPayload && (
              <button
                type="button"
                onClick={onInspectPayload}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Inspect raw schema payload"
                aria-label={`Inspect ${agent.label} payload`}
              >
                <Code2 size={14} />
              </button>
            )}

            {/* Expand/Collapse Chevron */}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title={isExpanded ? "Collapse section" : "Expand section"}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar if running */}
        {typeof progressPct === "number" && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-500 font-mono">Autonomous Execution Progress</span>
              <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">
                {progressPct}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Card Body - Content & Side Metrics */}
      {isExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800/80">
          {/* Main Pane Content */}
          <div className="p-4 sm:p-5 overflow-x-auto">{children}</div>

          {/* Side Telemetry & Meta Column */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between gap-4 text-xs">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                  Execution Meta
                </p>
                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all bg-white dark:bg-slate-800/60 p-1.5 rounded border border-slate-200/60 dark:border-slate-800">
                  {runMeta}
                </p>
              </div>

              {sideMetrics.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                    Telemetry
                  </p>
                  <dl className="space-y-1">
                    {sideMetrics.map((m) => (
                      <div
                        key={m.label}
                        className="flex items-center justify-between py-0.5 border-b border-slate-100 dark:border-slate-800/40 text-[11px]"
                      >
                        <dt className="text-slate-500 dark:text-slate-400">{m.label}</dt>
                        <dd className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {m.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Security Level: L3</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Verified Sandbox</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
