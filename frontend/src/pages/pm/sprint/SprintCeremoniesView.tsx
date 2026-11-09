import React, { useState } from "react";
import {
  Users,
  CheckCircle2,
  History,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";
import type { PMSprint } from "../../../lib/types/api";

export const CEREMONIES = [
  {
    key: "standup",
    label: "Daily Stand-up",
    badge: "DAILY",
    icon: Users,
    desc: "Autonomous 3-question synthesis: yesterday's commits, today's targets, and active blockers.",
    action: "standup",
  },
  {
    key: "review",
    label: "Sprint Review",
    badge: "DEMO",
    icon: CheckCircle2,
    desc: "Shipped features demo summary, acceptance criteria verification, and release notes.",
    action: "review",
  },
  {
    key: "retro",
    label: "Retrospective",
    badge: "LEARNINGS",
    icon: History,
    desc: "What went well, friction vectors, and autonomous velocity improvement actions.",
    action: "retro",
  },
  {
    key: "riskReport",
    label: "Risk Assessment",
    badge: "SAFETY",
    icon: AlertTriangle,
    desc: "Architectural vulnerabilities, dependency bottlenecks, and release timeline risks.",
    action: "riskReport",
  },
  {
    key: "techDebt",
    label: "Technical Debt",
    badge: "CODE HEALTH",
    icon: ShieldAlert,
    desc: "Refactoring backlog, mock residue cleanup, and code architecture hotspots.",
    action: "techDebt",
  },
];

interface SprintCeremoniesViewProps {
  selectedSprint: PMSprint;
  reports: any;
  standups: any[];
  generating: string | null;
  onGenerate: (key: string, action: string) => void;
}

export const SprintCeremoniesView: React.FC<SprintCeremoniesViewProps> = ({
  selectedSprint,
  reports,
  standups,
  generating,
  onGenerate,
}) => {
  const [selectedCeremony, setSelectedCeremony] = useState("standup");
  const [isCopied, setIsCopied] = useState(false);

  const activeCeremonyConfig = CEREMONIES.find((c) => c.key === selectedCeremony) || CEREMONIES[0];
  const ActiveIcon = activeCeremonyConfig.icon;

  const handleCopyReport = () => {
    let text = `Sprint ${selectedSprint.sprint_number} - ${activeCeremonyConfig.label}\n\n`;

    if (selectedCeremony === "standup" && standups.length > 0) {
      const s = standups[0];
      text += `Yesterday: ${s.yesterday || "None"}\nToday: ${s.today || "None"}\nBlockers: ${(s.blockers || []).join(", ") || "None"}\nHealth: ${s.sprint_health || "Optimal"}\n`;
    } else if (selectedCeremony === "review" && reports?.reviews?.[0]) {
      const r = reports.reviews[0];
      text += `Summary: ${r.summary}\nDemo Items: ${(r.demo_items || []).join(", ")}\n`;
    } else if (selectedCeremony === "retro" && reports?.retros?.[0]) {
      const r = reports.retros[0];
      text += `What Went Well:\n${(r.what_went_well || []).map((w: string) => `- ${w}`).join("\n")}\n\nWhat Went Wrong:\n${(r.what_went_wrong || []).map((w: string) => `- ${w}`).join("\n")}\n`;
    } else if (selectedCeremony === "riskReport" && reports?.risk_reports?.[0]) {
      const risks = reports.risk_reports[0].risks || [];
      text += `Risks:\n${risks.map((rk: any) => `[${rk.severity}] ${rk.description} - Mitigation: ${rk.mitigation || "N/A"}`).join("\n")}\n`;
    } else if (selectedCeremony === "techDebt" && reports?.tech_debt?.[0]) {
      const items = reports.tech_debt[0].items || [];
      text += `Tech Debt Items:\n${items.map((td: any) => `[${td.severity}] ${td.description} (${td.location || "N/A"}) - Impact: ${td.impact || "N/A"}`).join("\n")}\n`;
    } else {
      text += `Autonomous agile synthesis report for Sprint ${selectedSprint.sprint_number}.`;
    }

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    toast.success("Report copied to clipboard");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div id="sprint-ceremonies-view" className="space-y-4">
      {/* 5 Ceremony Selector Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" id="ceremony-cards-grid">
        {CEREMONIES.map((c) => {
          const Icon = c.icon;
          const isSelected = selectedCeremony === c.key;
          const isGen = generating === c.key;

          return (
            <div
              key={c.key}
              id={`ceremony-card-${c.key}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCeremony(c.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCeremony(c.key);
                }
              }}
              className={`rounded-2xl p-4 flex flex-col justify-between transition-all cursor-pointer border ${
                isSelected
                  ? "bg-teal-50 dark:bg-teal-950/40 border-teal-500/60 ring-2 ring-teal-500/20 shadow-sm"
                  : "bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-teal-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-2xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-teal-600 text-white shadow-2xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {c.badge}
                  </span>
                </div>

                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  {c.label}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {c.desc}
                </p>
              </div>

              <button
                type="button"
                id={`ceremony-gen-btn-${c.key}`}
                disabled={isGen}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCeremony(c.key);
                  onGenerate(c.key, c.action);
                }}
                className={`mt-3.5 w-full h-8 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? "bg-teal-600 hover:bg-teal-700 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                {isGen ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} className="text-amber-500" />
                )}
                <span>{isGen ? "GENERATING…" : "GENERATE"}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected Ceremony Detail Panel */}
      <div
        id="ceremony-detail-panel"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 md:p-6 shadow-2xs space-y-5"
      >
        {/* Panel Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <ActiveIcon size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                {activeCeremonyConfig.label}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sprint {selectedSprint.sprint_number} Autonomous Telemetry Synthesis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="ceremony-copy-report-btn"
              type="button"
              onClick={handleCopyReport}
              className="h-8.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              {isCopied ? <Check size={13} className="text-teal-600" /> : <Copy size={13} />}
              <span>{isCopied ? "COPIED" : "COPY REPORT"}</span>
            </button>

            <button
              id="ceremony-regenerate-btn"
              type="button"
              onClick={() => onGenerate(activeCeremonyConfig.key, activeCeremonyConfig.action)}
              disabled={generating === selectedCeremony}
              className="h-8.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <RefreshCw
                size={12}
                className={generating === selectedCeremony ? "animate-spin" : ""}
              />
              <span>REGENERATE</span>
            </button>
          </div>
        </div>

        {/* Dynamic Ceremony Content */}
        <div id="ceremony-content-area" className="space-y-4">
          {/* STANDUP */}
          {selectedCeremony === "standup" && (
            <div className="space-y-3.5">
              {standups.length > 0 ? (
                standups.map((s, idx) => (
                  <div key={idx} className="space-y-3 text-xs">
                    <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                      <span className="font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block mb-1">
                        YESTERDAY (COMPLETED WORK)
                      </span>
                      <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                        {s.yesterday || "Completed all assigned schema validations and baseline API endpoints."}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                      <span className="font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 block mb-1">
                        TODAY (COMMITTED DELIVERABLES)
                      </span>
                      <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                        {s.today || "Implementing WebSocket telemetry stream and unit test suites."}
                      </p>
                    </div>

                    {s.blockers && s.blockers.length > 0 && (
                      <div className="p-4 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
                        <span className="font-bold uppercase tracking-wider text-red-700 dark:text-red-300 block mb-1.5">
                          ACTIVE BLOCKERS
                        </span>
                        <ul className="list-disc list-inside space-y-1 text-slate-800 dark:text-slate-200 font-medium">
                          {s.blockers.map((b: string, i: number) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Sprint Health Indicator:</span>
                      <span className="font-bold text-teal-600 dark:text-teal-400">
                        {s.sprint_health || "OPTIMAL · ON TRACK"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No standup report generated yet. Click "Generate" to synthesize standup data.
                </div>
              )}
            </div>
          )}

          {/* SPRINT REVIEW */}
          {selectedCeremony === "review" && (
            <div className="space-y-4 text-xs">
              {reports?.reviews?.[0] ? (
                <div className="space-y-3.5">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                      EXECUTIVE REVIEW SUMMARY
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                      {reports.reviews[0].summary}
                    </p>
                  </div>

                  {reports.reviews[0].demo_items && (
                    <div className="p-4 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/50">
                      <span className="font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 block mb-2">
                        SHIPPED DEMO HIGHLIGHTS
                      </span>
                      <ul className="space-y-1.5 text-slate-800 dark:text-slate-200">
                        {reports.reviews[0].demo_items.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 size={13} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No review report generated yet. Click "Generate" to synthesize sprint demo review.
                </div>
              )}
            </div>
          )}

          {/* RETROSPECTIVE */}
          {selectedCeremony === "retro" && (
            <div className="space-y-4 text-xs">
              {reports?.retros?.[0] ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Went Well */}
                  <div className="rounded-xl p-4 border border-teal-200 dark:border-teal-900/50 bg-teal-50/40 dark:bg-teal-950/20">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-teal-200 dark:border-teal-900/40">
                      <CheckCircle2 size={16} className="text-teal-600 dark:text-teal-400" />
                      <h4 className="font-bold uppercase tracking-wider text-teal-800 dark:text-teal-200">
                        WHAT WENT WELL
                      </h4>
                    </div>
                    <ul className="space-y-2 text-slate-800 dark:text-slate-200 font-medium">
                      {(reports.retros[0].what_went_well || ["Fast release cadence", "High test coverage"]).map(
                        (s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-teal-600 font-bold shrink-0">•</span>
                            <span>{s}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  {/* Went Wrong / Action Items */}
                  <div className="rounded-xl p-4 border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-200 dark:border-amber-900/40">
                      <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
                      <h4 className="font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                        FRICTION & LEARNINGS
                      </h4>
                    </div>
                    <ul className="space-y-2 text-slate-800 dark:text-slate-200 font-medium">
                      {(reports.retros[0].what_went_wrong || ["Flaky integration test in CI", "Unclear proto specification"]).map(
                        (s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 leading-relaxed">
                            <span className="text-amber-600 font-bold shrink-0">•</span>
                            <span>{s}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No retrospective generated yet. Click "Generate" to synthesize sprint learnings.
                </div>
              )}
            </div>
          )}

          {/* RISK ASSESSMENT */}
          {selectedCeremony === "riskReport" && (
            <div className="space-y-3 text-xs">
              {reports?.risk_reports?.[0]?.risks?.length ? (
                reports.risk_reports[0].risks.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="rounded-xl p-4 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                            r.severity === "HIGH"
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300"
                              : r.severity === "MEDIUM"
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
                              : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300"
                          }`}
                        >
                          {r.severity} RISK
                        </span>
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {r.description}
                      </p>
                      {r.mitigation && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          <strong className="text-slate-700 dark:text-slate-300 uppercase mr-1">
                            Mitigation:
                          </strong>
                          {r.mitigation}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No risk report generated yet. Click "Generate" to audit potential delivery risks.
                </div>
              )}
            </div>
          )}

          {/* TECH DEBT */}
          {selectedCeremony === "techDebt" && (
            <div className="space-y-3 text-xs">
              {reports?.tech_debt?.[0]?.items?.length ? (
                reports.tech_debt[0].items.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="rounded-xl p-4 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {item.severity} DEBT
                        </span>
                        {item.location && (
                          <code className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {item.location}
                          </code>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.description}
                      </p>
                      {item.impact && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          <strong className="text-slate-700 dark:text-slate-300 uppercase mr-1">
                            Impact:
                          </strong>
                          {item.impact}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No technical debt audit generated yet. Click "Generate" to inspect code health.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
