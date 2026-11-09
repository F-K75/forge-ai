import React from "react";
import {
  Cpu,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { GATEWAY_AGENTS, type GatewayAgent } from "../../../lib/gatewayAgents";

interface AgentFleetMatrixViewProps {
  onSelectAgent: (agentId: string) => void;
  runningAgentsCount: number;
}

const STAGE_TAGS: Record<string, string> = {
  Discovery: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
  Definition: "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/40",
  Planning: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
  Execution: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800/40",
};

const AGENT_MODELS: Record<string, string> = {
  business_analyst: "Gemini 2.5 Pro",
  decision_engine: "Gemini 2.5 Flash",
  prd_writer: "Gemini 2.5 Pro",
  designer: "Gemini 2.5 Flash",
  epic_generator: "Gemini 2.5 Pro",
  story_generator: "Gemini 2.5 Flash",
  task_generator: "Gemini 2.5 Flash",
  sprint_planner: "Gemini 2.5 Flash",
  scrum_master: "Gemini 2.5 Flash",
  task_executor: "Claude 3.7 Sonnet / Code Runner",
  integration: "Gemini 2.5 Flash",
};

export function AgentFleetMatrixView({ onSelectAgent, runningAgentsCount }: AgentFleetMatrixViewProps) {
  return (
    <div id="agent-matrix-root" className="space-y-4">
      {/* Header Info */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cpu size={18} className="text-teal-600 dark:text-teal-400" />
            <span>Autonomous Gateway Agent Fleet Matrix</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Active multi-agent specialists provisioned on the Google AI Studio Gateway cluster.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            11 Agents Active
          </span>
        </div>
      </div>

      {/* Grid of All 11 Agents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GATEWAY_AGENTS.map((agent) => {
          const Icon = agent.icon;
          const stageBadge = STAGE_TAGS[agent.stage] || STAGE_TAGS.Discovery;
          const modelName = AGENT_MODELS[agent.id] || "Gemini 2.5 Pro";

          return (
            <div
              key={agent.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${agent.hue}18`, color: agent.hue }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {agent.label}
                      </h4>
                      <span className="font-mono text-[10px] text-slate-400">
                        @{agent.id}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stageBadge}`}>
                    {agent.stage}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                  {agent.purpose}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                  <Cpu size={11} className="text-teal-500" />
                  <span className="truncate max-w-[120px]">{modelName}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectAgent(agent.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer group-hover:translate-x-0.5 duration-150"
                >
                  <span>View Run</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
