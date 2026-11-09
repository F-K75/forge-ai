import { useState } from "react";
import { Cpu, CheckCircle2, RefreshCw, Terminal, Activity, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface AgentEntity {
  id: string;
  name: string;
  role: string;
  currentTask: string;
  status: "active" | "working" | "idle" | "done";
  color: string;
  statLabel: string;
  statValue: string;
  logs: string[];
}

export const DEFAULT_AGENTS: AgentEntity[] = [
  {
    id: "builder",
    name: "Builder",
    role: "Core Code Synthesis",
    currentTask: "Creating API routes & typed endpoints",
    status: "working",
    color: "#FF5722", // Molten orange / Forge signature
    statLabel: "Files synthesized",
    statValue: "12 files",
    logs: [
      "Generated src/api/auth.ts with session token validation",
      "Created PostgreSQL schema migrations for oauth_accounts table",
      "Bound endpoints to Hono router with typed input validation",
    ],
  },
  {
    id: "qa",
    name: "QA",
    role: "Verification & Regression",
    currentTask: "Running 42 tests across auth & billing",
    status: "working",
    color: "#30D158", // Crisp green
    statLabel: "Assertions passing",
    statValue: "42/42 passed",
    logs: [
      "Running unit tests for token expiration and cryptographic signature...",
      "Asserting CSRF prevention headers and secure cookie flags",
      "All 42 test specs passing (142ms execution duration)",
    ],
  },
  {
    id: "research",
    name: "Research",
    role: "RFC & Knowledge Grounding",
    currentTask: "Checking OAuth 2.1 RFC & token security spec",
    status: "active",
    color: "#64D2FF", // Electric cyan
    statLabel: "Spec adherence",
    statValue: "RFC 6749 / PKCE",
    logs: [
      "Verified PKCE code verifier SHA-256 requirements",
      "Audited refresh token rotation policy against replay attacks",
      "Confirmed Google Identity Services and GitHub OAuth endpoints",
    ],
  },
  {
    id: "architect",
    name: "Architect",
    role: "Topology & Data Contracts",
    currentTask: "Topology planned & verified",
    status: "done",
    color: "#BF5AF2", // Electric violet
    statLabel: "System integrity",
    statValue: "100% verified",
    logs: [
      "Parsed dependency graph: Architecture -> App Shell -> Auth/DB -> Edge",
      "Validated zero-cycle dependency across client and server packages",
      "Emitted runtime blueprint metadata",
    ],
  },
];

interface ForgeLivingAgentsProps {
  agents?: AgentEntity[];
  onSelectAgent?: (agent: AgentEntity) => void;
  compact?: boolean;
}

export function ForgeLivingAgents({
  agents = DEFAULT_AGENTS,
  onSelectAgent,
  compact = false,
}: ForgeLivingAgentsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedId);

  return (
    <div className="space-y-3">
      {/* Living Entity Nodes */}
      <div className="space-y-2">
        {agents.map((agent) => {
          const isSelected = agent.id === selectedId;
          const isWorking = agent.status === "working";
          const isDone = agent.status === "done";

          return (
            <div
              key={agent.id}
              onClick={() => {
                setSelectedId(isSelected ? null : agent.id);
                onSelectAgent?.(agent);
              }}
              className={`p-3 rounded-xl border transition-all cursor-pointer select-none group ${
                isSelected
                  ? "bg-white/[0.06] border-[#FF5722]/50 shadow-md"
                  : "bg-[#0E1016]/70 border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Living Glowing Pulse Node */}
                  <div className="relative flex items-center justify-center shrink-0 w-3 h-3">
                    {isWorking && (
                      <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                        style={{ backgroundColor: agent.color }}
                      />
                    )}
                    <span
                      className="relative inline-flex rounded-full w-2 h-2"
                      style={{
                        backgroundColor: agent.color,
                        boxShadow: isWorking ? `0 0 8px ${agent.color}` : undefined,
                      }}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#F4F4F6] tracking-tight">
                        {agent.name}
                      </span>
                      <span className="text-[10px] font-mono text-[#5A5D68] uppercase tracking-wider">
                        {agent.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A0A3AF] truncate mt-0.5 font-sans">
                      {agent.currentTask}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-mono text-[#888B96] bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
                    {agent.statValue}
                  </span>
                </div>
              </div>

              {/* Collapsible log view on selection */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 pt-2.5 border-t border-white/[0.06] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#888B96]">
                      <span className="flex items-center gap-1">
                        <Terminal size={10} className="text-[#FF5722]" /> Live Stream
                      </span>
                      <span className="text-emerald-400">active heartbeat</span>
                    </div>
                    <div className="bg-[#08090C] rounded-lg p-2 font-mono text-[10px] text-[#888B96] space-y-1 overflow-hidden">
                      {agent.logs.map((log, lIdx) => (
                        <div key={lIdx} className="flex items-start gap-1.5 leading-relaxed">
                          <span className="text-[#FF5722] select-none">›</span>
                          <span className="text-[#D1D4DC]">{log}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
