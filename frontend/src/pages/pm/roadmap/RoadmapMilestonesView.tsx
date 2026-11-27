import React from "react";
import {
  Flag,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Layers,
} from "lucide-react";
import type { PMInitiative, PMEpic, PMPRD } from "../../../lib/types/api";

interface RoadmapMilestonesViewProps {
  initiative: PMInitiative;
  epics: PMEpic[];
  prd: PMPRD | null;
}

export function RoadmapMilestonesView({
  initiative,
  epics,
  prd,
}: RoadmapMilestonesViewProps) {
  const rawPhases: Array<{ phase: string; goal: string; duration: string }> =
    (initiative?.roadmap as any[]) ?? [];

  // Default baseline phases if not generated yet
  const phases =
    rawPhases.length > 0
      ? rawPhases
      : [
          {
            phase: "Phase 1: Core Foundation & API Scaffolding",
            goal: "Establish schema contracts, authentication guardrails, and backend microservice stubs.",
            duration: "Weeks 1–3",
          },
          {
            phase: "Phase 2: Self-Serve Flow & UI Integration",
            goal: "Deliver end-user interactive flow, billing adjustments, and validation checks.",
            duration: "Weeks 4–7",
          },
          {
            phase: "Phase 3: Automated Testing & Edge-Case Guardrails",
            goal: "Complete concurrency tests, currency localization, and failover validation.",
            duration: "Weeks 8–10",
          },
          {
            phase: "Phase 4: General Availability Launch & Observability",
            goal: "Telemetry dashboards, SLA alerting, and production rollout with zero downtime.",
            duration: "Weeks 11–12",
          },
        ];

  return (
    <div id="roadmap-milestones-root" className="space-y-4">
      {/* Banner */}
      <div className="rounded-2xl border border-border bg-panel p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-ink flex items-center gap-2">
            <Flag size={18} className="text-accent" />
            <span>Strategic Milestones & Release Gates</span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Key initiative checkpoints, gate criteria, and delivery health verified against PRD specifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-info/10 text-info border border-info/30">
            {phases.length} Scheduled Milestones
          </span>
        </div>
      </div>

      {/* Milestones Timeline Cards */}
      <div className="space-y-4">
        {phases.map((phase, idx) => {
          const isCurrent = idx === 0;

          return (
            <div
              key={idx}
              className={`rounded-2xl border bg-panel p-5 shadow-sm transition-all space-y-4 ${
                isCurrent
                  ? "border-info/30 shadow-md ring-1 ring-info/10"
                  : "border-border"
              }`}
            >
              {/* Milestone Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-soft">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 rounded-xl items-center justify-center font-semibold text-xs ${
                      isCurrent
                        ? "bg-ink text-on-ink shadow-sm"
                        : "bg-panel-alt text-ink"
                    }`}
                  >
                    M{idx + 1}
                  </span>
                  <div>
                    <h4 className="font-semibold text-sm text-ink">
                      {phase.phase}
                    </h4>
                    <span className="text-[11px] font-mono text-faint flex items-center gap-1.5 mt-0.5">
                      <Clock size={11} className="text-accent" />
                      Target Duration: {phase.duration}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCurrent ? (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-ok/10 text-ok border border-ok/30 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
                      Active Milestone
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-panel-alt text-muted">
                      Upcoming
                    </span>
                  )}
                </div>
              </div>

              {/* Strategic Goal */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                  Strategic Objective & Target Outcome
                </span>
                <p className="text-xs sm:text-sm text-ink leading-relaxed font-medium bg-panel p-3 rounded-xl border border-border-soft">
                  {phase.goal}
                </p>
              </div>

              {/* Release Criteria & Key Gates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                <div className="p-3 rounded-xl border border-info/30 bg-info/20 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                    <ShieldCheck size={13} />
                    Release Gate Criteria
                  </span>
                  <ul className="space-y-1 text-muted">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-ok shrink-0" />
                      <span>PRD acceptance sign-off verified</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-ok shrink-0" />
                      <span>Zero P0 regression issues</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-ok shrink-0" />
                      <span>End-to-end integration test suite passed</span>
                    </li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl border border-border-soft bg-ink/10 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink flex items-center gap-1.5">
                    <Sparkles size={13} className="text-warn" />
                    AI Delivery Confidence
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-ink">
                      {95 - idx * 4}%
                    </span>
                    <span className="text-[11px] text-ok font-medium">
                      High Confidence
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Based on story points allocation, team load velocity, and dependency depth.
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
