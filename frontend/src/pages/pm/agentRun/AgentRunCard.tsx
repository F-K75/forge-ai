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
    bg: "bg-info/10",
    text: "text-accent",
    border: "border-info/30",
  },
  Definition: {
    bg: "bg-agent-business-improver/10",
    text: "text-agent-business-improver",
    border: "border-agent-business-improver/30",
  },
  Planning: {
    bg: "bg-warn/10",
    text: "text-warn",
    border: "border-warn/30",
  },
  Execution: {
    bg: "bg-agent-integration/10",
    text: "text-agent-integration",
    border: "border-agent-integration/30",
  },
};

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; badge: string; dot: string; pulse?: boolean }
> = {
  running: {
    label: "Running",
    badge: "bg-agent-integration/10 text-agent-integration border-agent-integration/30",
    dot: "bg-agent-integration",
    pulse: true,
  },
  needs_review: {
    label: "Needs Review",
    badge: "bg-warn/10 text-warn border-warn/30",
    dot: "bg-warn",
  },
  done: {
    label: "Completed",
    badge: "bg-ok/10 text-ok border-ok/30",
    dot: "bg-ok",
  },
  idle: {
    label: "Standby",
    badge: "bg-panel-alt text-muted border-border",
    dot: "bg-ink/30",
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
      className="rounded-2xl border border-border bg-panel shadow-sm overflow-hidden transition-all duration-200 hover:border-border"
    >
      {/* Card Header */}
      <div className="p-4 sm:p-5 border-b border-border-soft bg-ink/10">
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
                <h3 className="font-semibold text-sm sm:text-base text-ink tracking-tight">
                  {agent.label}
                </h3>

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stageTheme.bg} ${stageTheme.text} ${stageTheme.border}`}
                >
                  {agent.stage}
                </span>

                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-panel-alt text-muted font-mono">
                  <Cpu size={10} className="text-agent-integration" />
                  {modelName}
                </span>
              </div>

              <p className="text-xs text-muted truncate max-w-xl">
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
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-agent-integration opacity-75" />
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
              className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-ink/5 transition-colors cursor-pointer"
              title="Copy output payload"
              aria-label={`Copy ${agent.label} output`}
            >
              {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
            </button>

            {/* Inspect Payload Button */}
            {onInspectPayload && (
              <button
                type="button"
                onClick={onInspectPayload}
                className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-ink/5 transition-colors cursor-pointer"
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
                className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-ink/5 transition-colors cursor-pointer"
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
              <span className="text-muted font-mono">Autonomous Execution Progress</span>
              <span className="font-semibold text-ink font-mono">
                {progressPct}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-alt">
              <div
                className="h-full rounded-full bg-agent-integration transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Card Body - Content & Side Metrics */}
      {isExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] divide-y lg:divide-y-0 lg:divide-x divide-border-soft">
          {/* Main Pane Content */}
          <div className="p-4 sm:p-5 overflow-x-auto">{children}</div>

          {/* Side Telemetry & Meta Column */}
          <div className="p-4 bg-ink/10 flex flex-col justify-between gap-4 text-xs">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                  Execution Meta
                </p>
                <p className="font-mono text-[11px] text-muted break-all bg-panel p-1.5 rounded border border-border">
                  {runMeta}
                </p>
              </div>

              {sideMetrics.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-1.5">
                    Telemetry
                  </p>
                  <dl className="space-y-1">
                    {sideMetrics.map((m) => (
                      <div
                        key={m.label}
                        className="flex items-center justify-between py-0.5 border-b border-border-soft text-[11px]"
                      >
                        <dt className="text-muted">{m.label}</dt>
                        <dd className="font-mono font-semibold text-ink">
                          {m.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-border text-[10px] text-faint flex items-center justify-between">
              <span>Security Level: L3</span>
              <span className="text-ok font-medium">Verified Sandbox</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
