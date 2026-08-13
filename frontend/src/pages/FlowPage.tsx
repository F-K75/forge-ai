import { AgentFleetGraph } from "../components/AgentFleetGraph";
import { motion, motionVariants } from "../lib/animations";
import { AGENTS } from "../lib/agents";
import { GATEWAY_AGENTS } from "../lib/gatewayAgents";
import { Activity, Zap, GitBranch, ArrowRight, Play, ChevronRight, Timer, TrendingUp, ShieldCheck } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

const BUILD_STAGES = [
  { name: "Discovery", agents: GATEWAY_AGENTS.filter(a => a.stage === "Discovery").length, color: "#0071E3" },
  { name: "Definition", agents: GATEWAY_AGENTS.filter(a => a.stage === "Definition").length, color: "#BF5AF2" },
  { name: "Planning", agents: GATEWAY_AGENTS.filter(a => a.stage === "Planning").length, color: "#FF9F0A" },
  { name: "Execution", agents: GATEWAY_AGENTS.filter(a => a.stage === "Execution").length, color: "#30D158" },
];

const SOCIAL_PROOF = [
  { icon: TrendingUp, value: "1,247+", label: "Builds completed" },
  { icon: ShieldCheck, value: "99.9%", label: "Uptime SLA" },
  { icon: Timer, value: "~4 min", label: "Avg pipeline run" },
];

export default function FlowPage() {
  const [tourActive, setTourActive] = useState(false);
  const [tourSkipped, setTourSkipped] = useState(false);

  useEffect(() => {
    const hasSeenTour = sessionStorage.getItem("forge-flow-tour");
    if (!hasSeenTour) {
      setTourActive(true);
      sessionStorage.setItem("forge-flow-tour", "true");
    }
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
        <motion.div
          variants={motionVariants.staggerContainer}
          initial="hidden"
          animate="visible"
          className="min-w-0"
        >
          <motion.div variants={motionVariants.staggerItem} className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Activity size={14} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium tracking-wide text-muted">Agent Orchestration</span>
          </motion.div>

          <motion.h1
            variants={motionVariants.staggerItem}
            className="mt-3 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ink md:text-4xl"
          >
            Ship software faster with AI agents
          </motion.h1>
          <motion.p variants={motionVariants.staggerItem} className="mt-3 text-[15px] leading-relaxed text-muted">
            From brief to deploy, specialist agents plan, build, review, and ship production software in minutes — not weeks.
          </motion.p>

          <motion.div variants={motionVariants.staggerItem} className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startBuild}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Play size={16} aria-hidden="true" />
              Start your first build
            </button>
            <span className="text-xs text-muted">No credit card required</span>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mt-8"
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {SOCIAL_PROOF.map((item) => (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-xl"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-accent/10 text-accent">
                    <item.icon size={13} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-base font-semibold leading-none text-ink">{item.value}</div>
                    <div className="mt-1 truncate text-[11px] leading-none text-muted">{item.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mt-8"
        >
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-1.5">
            {BUILD_STAGES.map((stage) => (
              <div
                key={stage.name}
                className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <span className="flex h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-xs font-medium text-ink">{stage.name}</span>
                <span className="text-[11px] text-muted">{stage.agents}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-panel/95 shadow-m3-2 backdrop-blur-xl">
            {tourActive && !tourSkipped && (
              <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2">
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
            <AgentFleetGraph embedded={false} autoPlay={tourActive} onTourEnd={skipTour} />
          </div>
        </motion.div>
      </section>
    </div>
  );
}
