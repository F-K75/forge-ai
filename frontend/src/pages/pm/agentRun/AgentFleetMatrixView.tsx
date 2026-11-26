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
  Discovery: "bg-info/10 text-info border-info/30",
  Definition: "bg-agent-business-improver/10 text-agent-business-improver border-agent-business-improver/30",
  Planning: "bg-warn/10 text-warn border-warn/30",
  Execution: "bg-agent-integration/10 text-agent-integration border-agent-integration/30",
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
      <div className="rounded-2xl border border-border bg-panel p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-ink flex items-center gap-2">
            <Cpu size={18} className="text-agent-integration" />
            <span>Autonomous Gateway Agent Fleet Matrix</span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Active multi-agent specialists provisioned on the Google AI Studio Gateway cluster.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-ok/10 text-ok border border-ok/30 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ok" />
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
              className="rounded-2xl border border-border bg-panel p-4 shadow-sm hover:border-border hover:shadow-md transition-all flex flex-col justify-between group"
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
                      <h4 className="font-semibold text-sm text-ink">
                        {agent.label}
                      </h4>
                      <span className="font-mono text-[10px] text-faint">
                        @{agent.id}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stageBadge}`}>
                    {agent.stage}
                  </span>
                </div>

                <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                  {agent.purpose}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-[11px] text-muted font-mono">
                  <Cpu size={11} className="text-agent-integration" />
                  <span className="truncate max-w-[120px]">{modelName}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectAgent(agent.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-agent-integration hover:text-agent-integration transition-colors cursor-pointer group-hover:translate-x-0.5 duration-150"
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
