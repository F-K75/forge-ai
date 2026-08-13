import { AgentFleetGraph } from "../components/AgentFleetGraph";
import { motion, motionVariants } from "../lib/animations";
import { AGENTS } from "../lib/agents";
import { GATEWAY_AGENTS } from "../lib/gatewayAgents";
import { Activity, Zap, GitBranch, ArrowRight } from "lucide-react";

const BUILD_STAGES = [
  { name: "Discovery", agents: GATEWAY_AGENTS.filter(a => a.stage === "Discovery").length, color: "#0071E3" },
  { name: "Definition", agents: GATEWAY_AGENTS.filter(a => a.stage === "Definition").length, color: "#BF5AF2" },
  { name: "Planning", agents: GATEWAY_AGENTS.filter(a => a.stage === "Planning").length, color: "#FF9F0A" },
  { name: "Execution", agents: GATEWAY_AGENTS.filter(a => a.stage === "Execution").length, color: "#30D158" },
];

export default function FlowPage() {
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
            Agent Flow
          </motion.h1>
          <motion.p variants={motionVariants.staggerItem} className="mt-3 text-[15px] leading-relaxed text-muted">
            Explore the build pipeline and gateway agents that power Forge. Click a node to inspect status, credits, and last-run details.
          </motion.p>

          <motion.div variants={motionVariants.staggerItem} className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { icon: GitBranch, value: AGENTS.length + GATEWAY_AGENTS.length, suffix: "", label: "Total Agents" },
              { icon: Zap, value: 23, suffix: "", label: "Credits per Run" },
              { icon: Activity, value: 6, suffix: "", label: "Build Steps" },
              { icon: ArrowRight, value: 4, suffix: "", label: "Stages" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-xl transition-all duration-200 hover:border-white/15 hover:bg-white/[0.04] hover:shadow-m3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-accent/10 text-accent">
                    <stat.icon size={13} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-base font-semibold leading-none text-ink">
                      {stat.value}{stat.suffix}
                    </div>
                    <div className="mt-1 truncate text-[11px] leading-none text-muted">{stat.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
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
            <AgentFleetGraph embedded={false} />
          </div>
        </motion.div>
      </section>
    </div>
  );
}
