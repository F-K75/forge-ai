import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { GatewayAgent } from "../../lib/gatewayAgents";

export type RunStatus = "running" | "needs_review" | "done";

const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  needs_review: "Needs review",
  done: "Done",
};

const STATUS_CLASS: Record<RunStatus, string> = {
  running: "text-accent border-accent/30 bg-accent-soft",
  needs_review: "text-warn border-warn/30 bg-warn/10",
  done: "text-ok border-ok/30 bg-ok/10",
};

const STATUS_DOT_CLASS: Record<RunStatus, string> = {
  running: "bg-accent animate-pulse motion-reduce:animate-none",
  needs_review: "bg-warn",
  done: "bg-ok",
};

export function RunStatusPill({ status, label }: { status: RunStatus; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASS[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export interface RunSideMetric {
  label: string;
  value: string;
}

export interface RunLogLine {
  time: string;
  text: string;
  emphasis?: "accent" | "ok" | "warn" | "error";
}

export interface AgentRunShellProps {
  agent: GatewayAgent;
  runId: string;
  runTitle: string;
  runMeta: string;
  status: RunStatus;
  statusLabel?: string;
  progressPct?: number;
  sideMetrics?: RunSideMetric[];
  sideExtra?: { label: string; content: ReactNode };
  log?: RunLogLine[];
  onDismiss?: () => void;
  children: ReactNode;
}

const EMPHASIS_CLASS: Record<NonNullable<RunLogLine["emphasis"]>, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  error: "text-error",
};

// Shared chrome for every agent's run view: topbar (avatar, name, status) +
// a side rail (cost/tokens/progress/log) that's identical across all 11
// agents, wrapping a `children` main pane unique to what that agent produces.
export function AgentRunShell({
  agent,
  runId,
  runTitle,
  runMeta,
  status,
  statusLabel,
  progressPct,
  sideMetrics = [],
  sideExtra,
  log,
  onDismiss,
  children,
}: AgentRunShellProps) {
  const Icon = agent.icon;

  return (
    <div className="bb-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${agent.hue}24`, color: agent.hue }}
          >
            <Icon size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink font-display">{runTitle}</p>
            <p className="truncate font-mono text-[11px] text-faint">{runMeta}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RunStatusPill status={status} label={statusLabel} />
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="bb-btn bb-btn-icon bb-btn-ghost"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
        <div className="border-b border-border-soft p-5 md:border-b-0 md:border-r">{children}</div>

        <div className="flex flex-col gap-5 p-4">
          {(sideMetrics.length > 0 || typeof progressPct === "number") && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">Run</p>
              <dl className="flex flex-col gap-1">
                {sideMetrics.map((m) => (
                  <div key={m.label} className="flex items-center justify-between text-xs">
                    <dt className="text-muted">{m.label}</dt>
                    <dd className="font-mono text-ink">{m.value}</dd>
                  </div>
                ))}
              </dl>
              {typeof progressPct === "number" && (
                <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-panel-alt">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {sideExtra && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">
                {sideExtra.label}
              </p>
              {sideExtra.content}
            </div>
          )}

          {log && log.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">Log</p>
              <div className="flex flex-col gap-1.5 font-mono text-[10.5px] leading-relaxed text-muted">
                {log.map((l, i) => (
                  <div key={i}>
                    <span className={l.emphasis ? EMPHASIS_CLASS[l.emphasis] : "text-faint"}>
                      [{l.time}]
                    </span>{" "}
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RunCard({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3.5 ${
        accent ? "border-accent/30 bg-accent-soft" : "bb-card"
      }`}
    >
      {children}
    </div>
  );
}

export function RunSectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-faint">{children}</p>;
}
