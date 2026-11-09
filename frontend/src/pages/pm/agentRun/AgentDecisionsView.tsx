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
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Scale size={18} className="text-purple-600 dark:text-purple-400" />
            <span>Autonomous Decision Engine Feed</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit trail of automated architectural trade-offs, scope revisions, and re-estimations
            governed by AI Gateway.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
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
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 items-center justify-center font-bold text-xs">
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Autonomous Re-estimation & Scope Adjustment
                    </span>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Logged {new Date(dec.at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  {status ? (
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                        status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                      }`}
                    >
                      {status === "approved" ? "Human Approved" : "Overridden"}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleFeedback(idx, "approved")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 transition-colors cursor-pointer"
                        title="Accept recommendation"
                      >
                        <ThumbsUp size={12} />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(idx, "overridden")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 transition-colors cursor-pointer"
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Agent Recommendation
                </span>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed">
                  {dec.summary}
                </p>
              </div>

              {/* Grid: Bottlenecks & Next Recommended Tasks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Bottlenecks */}
                <div className="p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/40 dark:bg-rose-950/20 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    Identified Bottlenecks
                  </span>
                  {dec.bottlenecks.length > 0 ? (
                    <ul className="space-y-1">
                      {dec.bottlenecks.map((b, bi) => (
                        <li key={bi} className="text-xs text-rose-800 dark:text-rose-200 flex items-start gap-1.5">
                          <span className="text-rose-500 font-bold">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-rose-600/70">No critical bottlenecks detected.</p>
                  )}
                </div>

                {/* Next Tasks */}
                <div className="p-3 rounded-xl border border-teal-100 dark:border-teal-900/30 bg-teal-50/40 dark:bg-teal-950/20 space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                    <ListTodo size={13} />
                    Recommended Next Actions
                  </span>
                  {dec.recommendedNextTasks.length > 0 ? (
                    <ul className="space-y-1">
                      {dec.recommendedNextTasks.map((t, ti) => (
                        <li key={ti} className="text-xs text-teal-800 dark:text-teal-200 flex items-start gap-1.5">
                          <ArrowRight size={12} className="text-teal-500 shrink-0 mt-0.5" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-teal-600/70">No follow-up action items scheduled.</p>
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
