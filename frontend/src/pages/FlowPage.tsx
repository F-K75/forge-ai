import { AgentFleetGraph } from "../components/AgentFleetGraph";
import { motion, motionVariants } from "../lib/animations";
import { Activity, Zap, GitBranch, ArrowRight, Play, Timer, TrendingUp, ShieldCheck, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { analyticsApi, flowApi } from "../lib/api";

const BUILD_STAGES = [
  { name: "Discovery", agents: 2, color: "#0071E3", description: "Research & analysis" },
  { name: "Definition", agents: 2, color: "#BF5AF2", description: "Spec & design" },
  { name: "Planning", agents: 4, color: "#FF9F0A", description: "Breakdown & scheduling" },
  { name: "Execution", agents: 3, color: "#30D158", description: "Build & ship" },
];

const DEFAULT_SOCIAL_PROOF = [
  { icon: TrendingUp, value: "1,247+", label: "Builds completed", trend: "+12%" },
  { icon: ShieldCheck, value: "99.9%", label: "Uptime SLA", trend: "99.9%" },
  { icon: Timer, value: "~4 min", label: "Avg pipeline run", trend: "-18%" },
];

export default function FlowPage() {
  const [tourActive, setTourActive] = useState(false);
  const [tourSkipped, setTourSkipped] = useState(false);
  const [socialProof, setSocialProof] = useState(DEFAULT_SOCIAL_PROOF);
  const [agentStats, setAgentStats] = useState<Record<string, { lastRun?: string; duration?: string; successRate?: number }>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"graph" | "timeline">("graph");

  useEffect(() => {
    const hasSeenTour = sessionStorage.getItem("forge-flow-tour");
    if (!hasSeenTour) {
      setTourActive(true);
      sessionStorage.setItem("forge-flow-tour", "true");
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      flowApi.personalAnalytics(30).catch(() => null),
      flowApi.agentStats().catch(() => null),
    ]).then(([personal, stats]) => {
      if (cancelled) return;
      setLoading(false);

      if (personal) {
        setSocialProof((prev) => [
          { ...prev[0], value: `${personal.builds_total ?? prev[0].value}` },
          { ...prev[1], value: `${((personal.success_rate ?? 0) * 100).toFixed(1)}%` },
          { ...prev[2], value: personal.avg_build_time_minutes ? `${personal.avg_build_time_minutes.toFixed(1)} min` : prev[2].value },
        ]);
      }

      if (stats?.agents) {
        const mapped: Record<string, { lastRun?: string; duration?: string; successRate?: number }> = {};
        for (const agent of stats.agents) {
          const key = agent._id;
          mapped[key] = {
            lastRun: agent.last_active_at ? new Date(agent.last_active_at).toLocaleString() : undefined,
            duration: undefined,
            successRate: agent.avg_pass_rate ? Math.round(agent.avg_pass_rate * 100) : undefined,
          };
        }
        setAgentStats(mapped);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const skipTour = useCallback(() => {
    setTourActive(false);
    setTourSkipped(true);
  }, []);

  const startBuild = useCallback(() => {
    window.location.href = "/projects";
  }, []);

  return (
    <div className="mx-auto px-4 pb-16 md:px-8">
      <section aria-label="Agent flow" className="relative pt-6 md:pt-10">
        {/* Hero Section */}
        <motion.div
          variants={motionVariants.staggerContainer}
          initial="hidden"
          animate="visible"
          className="min-w-0"
        >
          <div className="flex flex-col gap-1">
            <motion.div variants={motionVariants.staggerItem} className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Activity size={14} aria-hidden="true" />
              </span>
              <span className="text-xs font-medium tracking-wide text-muted">Agent Orchestration</span>
            </motion.div>

            <motion.h1
              variants={motionVariants.staggerItem}
              className="font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ink md:text-4xl"
            >
              Ship software faster with AI agents
            </motion.h1>
            <motion.p variants={motionVariants.staggerItem} className="text-[15px] leading-relaxed text-muted">
              From brief to deploy, specialist agents plan, build, review, and ship production software in minutes — not weeks.
            </motion.p>
          </div>

          <motion.div variants={motionVariants.staggerItem} className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startBuild}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Play size={16} aria-hidden="true" />
              Start a build
            </button>
            <span className="text-xs text-muted">No credit card required</span>
          </motion.div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mt-8"
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
            {socialProof.map((item) => (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-2xl border border-inlay bg-inlay-subtle px-4 py-3 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-inlay-strong bg-accent/10 text-accent">
                      <item.icon size={13} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold leading-none text-ink">
                        {loading ? "..." : item.value}
                      </div>
                      <div className="mt-1 truncate text-[11px] leading-none text-muted">{item.label}</div>
                    </div>
                  </div>
                  {item.trend && (
                    <span className="text-[10px] font-medium text-accent">{item.trend}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Stage Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mt-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {BUILD_STAGES.map((stage, index) => (
                <div key={stage.name} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-inlay bg-inlay-subtle px-3 py-2">
                    <span className="flex h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-ink">{stage.name}</span>
                      <span className="ml-2 text-[11px] text-muted">{stage.agents}</span>
                    </div>
                  </div>
                  {index < BUILD_STAGES.length - 1 && (
                    <ChevronRight size={14} className="text-faint" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>

            <div className="flex shrink-0 gap-1 rounded-full bg-inlay-subtle p-0.5" role="group" aria-label="View mode">
              {(
                [
                  { key: "graph" as const, label: "Graph" },
                  { key: "timeline" as const, label: "Timeline" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewMode(key)}
                  aria-pressed={viewMode === key}
                  className={[
                    "h-8 cursor-pointer rounded-full px-3 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                    viewMode === key ? "bg-accent-soft text-accent" : "text-muted hover:text-ink",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Graph Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mt-4"
        >
          <div className="rounded-2xl border border-inlay bg-panel/95 shadow-m3-2 backdrop-blur-xl">
            {tourActive && !tourSkipped && (
              <div className="flex items-center justify-between border-b border-inlay px-4 py-2">
                <span className="text-xs text-muted">Guided tour: watch how a build flows through agents</span>
                <button
                  type="button"
                  onClick={skipTour}
                  className="text-xs text-accent transition hover:underline"
                >
                  Skip
                </button>
              </div>
            )}
            <AgentFleetGraph embedded={false} autoPlay={tourActive} onTourEnd={skipTour} agentStats={agentStats} />
          </div>
        </motion.div>
      </section>
    </div>
  );
}
