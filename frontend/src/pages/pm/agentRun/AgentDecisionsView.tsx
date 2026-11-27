import React, { useState } from "react";
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Clock,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  CornerDownRight,
  ListTodo,
} from "lucide-react";
import toast from "react-hot-toast";

interface DecisionItem {
  taskId?: string;
  summary: string;
  recommendedNextTasks: string[];
  bottlenecks: string[];
  at: number;
}

interface AgentDecisionsViewProps {
  decisionFeed: DecisionItem[];
}

export function AgentDecisionsView({ decisionFeed }: AgentDecisionsViewProps) {
  const [decisions, setDecisions] = useState(decisionFeed);
  const [feedbackState, setFeedbackState] = useState<Record<number, "approved" | "overridden">>({});

  const handleFeedback = (index: number, action: "approved" | "overridden") => {
    setFeedbackState((prev) => ({ ...prev, [index]: action }));
    if (action === "approved") {
      toast.success("Decision confirmed and applied to backlog");
    } else {
      toast("Decision overridden — agent noted human feedback", { icon: "✍️" });
    }
  };

  const feedToRender =
    decisions.length > 0
      ? decisions
      : [
          {
            summary: "Re-estimated proration task after a 2h overrun.",
            recommendedNextTasks: ["Add proration edge-case tests", "Validate currency locale keys"],
            bottlenecks: ["Backend over capacity by 2h"],
            at: Date.now() - 3600000,
          },
        ];

  return (
    <div id="agent-decisions-root" className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border bg-panel p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-ink flex items-center gap-2">
            <Scale size={18} className="text-agent-business-improver" />
            <span>Autonomous Decision Engine Feed</span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Audit trail of automated architectural trade-offs, scope revisions, and re-estimations
            governed by AI Gateway.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-agent-business-improver/10 text-agent-business-improver border border-agent-business-improver/30">
            {feedToRender.length} Active Decisions
          </span>
        </div>
      </div>

      {/* Decision Cards List */}
      <div className="space-y-3">
        {feedToRender.map((dec, idx) => {
          const status = feedbackState[idx];

          return (
            <div
              key={idx}
              className="rounded-2xl border border-border bg-panel p-5 shadow-sm space-y-4 hover:border-border transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-soft">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 rounded-lg bg-agent-business-improver/10 text-agent-business-improver items-center justify-center font-semibold text-xs">
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-ink">
                      Autonomous Re-estimation & Scope Adjustment
                    </span>
                    <p className="text-[11px] text-faint font-mono">
                      Logged {new Date(dec.at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  {status ? (
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                        status === "approved"
                          ? "bg-ok/10 text-ok border-ok/30 "
                          : "bg-warn/10 text-warn border-warn/30 "
                      }`}
                    >
                      {status === "approved" ? "Human Approved" : "Overridden"}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleFeedback(idx, "approved")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-panel-alt text-ink hover:bg-ok/20 hover:text-ok transition-colors cursor-pointer"
                        title="Accept recommendation"
                      >
                        <ThumbsUp size={12} />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(idx, "overridden")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-panel-alt text-ink hover:bg-error/20 hover:text-error transition-colors cursor-pointer"
                        title="Override recommendation"
                      >
                        <ThumbsDown size={12} />
                        <span>Override</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Rationale & Recommendation */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                  Agent Recommendation
                </span>
                <p className="text-sm font-medium text-ink bg-panel p-3 rounded-xl border border-border-soft leading-relaxed">
                  {dec.summary}
                </p>
              </div>

              {/* Grid: Bottlenecks & Next Recommended Tasks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Bottlenecks */}
                <div className="p-3 rounded-xl border border-error/30 bg-error/20 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-error flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    Identified Bottlenecks
                  </span>
                  {dec.bottlenecks.length > 0 ? (
                    <ul className="space-y-1">
                      {dec.bottlenecks.map((b, bi) => (
                        <li key={bi} className="text-xs text-error flex items-start gap-1.5">
                          <span className="text-error font-semibold">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-error/70">No critical bottlenecks detected.</p>
                  )}
                </div>

                {/* Next Tasks */}
                <div className="p-3 rounded-xl border border-agent-integration/30 bg-agent-integration/20 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-agent-integration flex items-center gap-1.5">
                    <ListTodo size={13} />
                    Recommended Next Actions
                  </span>
                  {dec.recommendedNextTasks.length > 0 ? (
                    <ul className="space-y-1">
                      {dec.recommendedNextTasks.map((t, ti) => (
                        <li key={ti} className="text-xs text-agent-integration flex items-start gap-1.5">
                          <ArrowRight size={12} className="text-agent-integration shrink-0 mt-0.5" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-agent-integration/70">No follow-up action items scheduled.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
