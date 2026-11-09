import React, { useState, useRef, useEffect } from "react";
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Cpu,
  CornerDownRight,
} from "lucide-react";
import toast from "react-hot-toast";
import type { PMExecution } from "../../../lib/types/api";

interface AgentConsoleViewProps {
  executions: PMExecution[];
  initiativeId?: string;
}

type LogFilter = "all" | "thoughts" | "stdout" | "errors";

export function AgentConsoleView({ executions, initiativeId }: AgentConsoleViewProps) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  // Derive consolidated logs from executions
  const allLogs = React.useMemo(() => {
    const list: Array<{
      id: string;
      time: string;
      agent: string;
      type: "thought" | "stdout" | "error" | "info";
      message: string;
    }> = [];

    executions.forEach((exec) => {
      const agentName = exec.agent || "task_executor";

      if (exec.current_thought) {
        list.push({
          id: `${exec.id}-thought`,
          time: new Date().toLocaleTimeString(),
          agent: agentName,
          type: "thought",
          message: `Thought: ${exec.current_thought}`,
        });
      }

      (exec.logs || []).forEach((logText, i) => {
        const isError =
          logText.toLowerCase().includes("error") ||
          logText.toLowerCase().includes("fail") ||
          logText.toLowerCase().includes("exception");
        list.push({
          id: `${exec.id}-log-${i}`,
          time: new Date(Date.now() - (exec.logs!.length - i) * 2000).toLocaleTimeString(),
          agent: agentName,
          type: isError ? "error" : "stdout",
          message: logText,
        });
      });
    });

    // Fallback baseline if executions has minimal logs
    if (list.length === 0) {
      list.push(
        {
          id: "init-1",
          time: new Date(Date.now() - 25000).toLocaleTimeString(),
          agent: "business_analyst",
          type: "thought",
          message: "Deconstructing problem brief: identifying target personas and key business objectives.",
        },
        {
          id: "init-2",
          time: new Date(Date.now() - 22000).toLocaleTimeString(),
          agent: "prd_writer",
          type: "stdout",
          message: "Generated PRD sections: Executive summary, Problem, Solution, Scope matrix.",
        },
        {
          id: "init-3",
          time: new Date(Date.now() - 18000).toLocaleTimeString(),
          agent: "epic_generator",
          type: "stdout",
          message: "Partitioned quarter deliverable into structured epics and priority rankings.",
        },
        {
          id: "init-4",
          time: new Date(Date.now() - 14000).toLocaleTimeString(),
          agent: "scrum_master",
          type: "thought",
          message: "Auditing sprint capacity against developer story estimates and dependencies.",
        },
        {
          id: "init-5",
          time: new Date(Date.now() - 8000).toLocaleTimeString(),
          agent: "task_executor",
          type: "thought",
          message: "Spawning isolated sandbox runner on secure container cluster.",
        },
        {
          id: "init-6",
          time: new Date(Date.now() - 4000).toLocaleTimeString(),
          agent: "task_executor",
          type: "stdout",
          message: "checked out branch task/3390-proration-endpoint",
        },
        {
          id: "init-7",
          time: new Date().toLocaleTimeString(),
          agent: "task_executor",
          type: "stdout",
          message: "4 passed, 1 failed - test_proration_currency_locale",
        }
      );
    }

    return list;
  }, [executions]);

  const filteredLogs = allLogs.filter((l) => {
    if (filter === "thoughts") return l.type === "thought";
    if (filter === "stdout") return l.type === "stdout";
    if (filter === "errors") return l.type === "error";
    return true;
  });

  useEffect(() => {
    if (
      autoScroll &&
      consoleBottomRef.current &&
      typeof consoleBottomRef.current.scrollIntoView === "function"
    ) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs, autoScroll]);

  const handleCopyBuffer = () => {
    const text = filteredLogs
      .map((l) => `[${l.time}] [${l.agent}] [${l.type.toUpperCase()}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Console buffer copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="agent-console-root"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 shadow-xl overflow-hidden font-mono flex flex-col h-[580px]"
    >
      {/* Terminal Top Window Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs select-none shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-slate-400 text-[11px] ml-2 font-medium flex items-center gap-1.5">
            <Terminal size={12} className="text-teal-400" />
            ai-gateway-agent://runner.forge.internal/session/{initiativeId?.slice(0, 8) || "live"}
          </span>
        </div>

        {/* Console Controls */}
        <div className="flex items-center gap-2 font-sans">
          {/* Filter Pills */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg text-[11px]">
            {(["all", "thoughts", "stdout", "errors"] as LogFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded capitalize transition-colors cursor-pointer ${
                  filter === f
                    ? "bg-teal-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-0 h-3 w-3 cursor-pointer"
            />
            <span>Auto-scroll</span>
          </label>

          <button
            type="button"
            onClick={handleCopyBuffer}
            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors cursor-pointer"
            title="Copy buffer"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {/* Terminal Log Stream Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-1.5 text-[11.5px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        <div className="text-slate-500 pb-2 border-b border-slate-800/80 text-[11px]">
          [SYSTEM] Initialized Gemini 2.5 Multi-Agent Orchestrator Sandbox. Listening on secure telemetry channel...
        </div>

        {filteredLogs.map((log) => {
          let badgeColor = "text-slate-400 bg-slate-900 border-slate-800";
          let messageColor = "text-slate-200";

          if (log.type === "thought") {
            badgeColor = "text-purple-300 bg-purple-950/60 border-purple-800/40";
            messageColor = "text-purple-200/90 italic";
          } else if (log.type === "error") {
            badgeColor = "text-rose-300 bg-rose-950/60 border-rose-800/40";
            messageColor = "text-rose-300 font-semibold";
          } else if (log.type === "stdout") {
            badgeColor = "text-teal-300 bg-teal-950/60 border-teal-800/40";
          }

          return (
            <div
              key={log.id}
              className="flex items-start gap-2.5 py-0.5 hover:bg-slate-900/50 rounded px-1.5 -mx-1.5 transition-colors group"
            >
              <span className="text-slate-500 select-none shrink-0 text-[10.5px]">
                {log.time}
              </span>

              <span
                className={`text-[10px] px-1.5 py-0.2 rounded border shrink-0 font-sans font-medium uppercase tracking-wider ${badgeColor}`}
              >
                {log.agent}
              </span>

              <span className="text-slate-600 select-none shrink-0">
                {log.type === "thought" ? "💭" : "❯"}
              </span>

              <span className={`flex-1 break-all ${messageColor}`}>{log.message}</span>
            </div>
          );
        })}

        <div ref={consoleBottomRef} />
      </div>

      {/* Terminal Footer Bar */}
      <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0 font-sans">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Session
          </span>
          <span>{filteredLogs.length} events logged</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Encoding: UTF-8</span>
          <span>·</span>
          <span>Buffer: 100% OK</span>
        </div>
      </div>
    </div>
  );
}
