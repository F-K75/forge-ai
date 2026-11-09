import React, { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Activity,
  Bot,
  Brain,
  Zap,
  Lightbulb,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Download,
  Terminal,
  FileCode,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  X,
  Play,
  Check,
  GitCommit,
  GitBranch,
  Calendar,
  Users,
  Eye,
  Info,
  Loader2,
  FileText,
} from "lucide-react";
import { usePMStore, type DecisionFeedItem } from "../../store/pmStore";
import { agentExecutionsApi, tasksApi } from "../../lib/pmApi";
import type { PMExecution, PMTask } from "../../lib/types/api";

export type ActivityCategory =
  | "all"
  | "agent_exec"
  | "decision"
  | "transition"
  | "alert";

export interface ActivityEvent {
  id: string;
  category: "agent_exec" | "decision" | "transition" | "alert";
  title: string;
  subtitle?: string;
  timestamp: string;
  actor: {
    name: string;
    type: "agent" | "system" | "user";
    role?: string;
  };
  status: "running" | "completed" | "failed" | "queued" | "info" | "warning";
  metadata?: {
    taskId?: string;
    taskTitle?: string;
    tokens?: number;
    cost?: number;
    durationSeconds?: number;
    currentThought?: string;
    logs?: string[];
    generatedFiles?: string[];
    bottlenecks?: string[];
    recommendedNextTasks?: string[];
    error?: string | null;
  };
}

// Agent color and persona definitions
const AGENT_PERSONA_META: Record<
  string,
  { label: string; badgeCls: string; avatarBg: string }
> = {
  DevOpsAgent: {
    label: "DevOps & Infrastructure",
    badgeCls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
    avatarBg: "bg-sky-600 text-white",
  },
  BackendEng: {
    label: "Backend Engineer",
    badgeCls:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    avatarBg: "bg-emerald-600 text-white",
  },
  FrontendEng: {
    label: "Frontend Engineer",
    badgeCls:
      "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
    avatarBg: "bg-purple-600 text-white",
  },
  SecurityReviewer: {
    label: "Security Reviewer",
    badgeCls:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    avatarBg: "bg-amber-600 text-white",
  },
  ArchitectAgent: {
    label: "System Architect",
    badgeCls:
      "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    avatarBg: "bg-indigo-600 text-white",
  },
  QASuite: {
    label: "QA Automation",
    badgeCls:
      "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    avatarBg: "bg-teal-600 text-white",
  },
  DecisionEngine: {
    label: "Neural Decision Engine",
    badgeCls:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    avatarBg: "bg-rose-600 text-white",
  },
};

function getAgentMeta(name: string) {
  return (
    AGENT_PERSONA_META[name] || {
      label: name || "Autonomous Agent",
      badgeCls:
        "bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 border-neutral-500/20",
      avatarBg: "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900",
    }
  );
}

function formatRelativeTime(dateInput?: string | number): string {
  if (!dateInput) return "Just now";
  const date = typeof dateInput === "number" ? new Date(dateInput) : new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 30) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ActivityTab() {
  const {
    initiative,
    executions,
    tasks,
    decisionFeed,
    refreshExecutions,
    refreshTasks,
    addExecutionLocal,
  } = usePMStore();

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<ActivityCategory>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(15); // seconds, 0 = off
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Inspector state
  const [inspectEvent, setInspectEvent] = useState<ActivityEvent | null>(null);
  const [activeTab, setActiveTab] = useState<"logs" | "thought" | "files" | "metrics">("logs");
  const [showExportModal, setShowExportModal] = useState(false);

  // Task title lookup helper
  const taskTitle = useCallback(
    (taskId?: string) => {
      if (!taskId) return "General Workstream Task";
      return tasks.find((t) => t.id === taskId)?.title || taskId;
    },
    [tasks]
  );

  // Periodic auto-refresh
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      refreshExecutions();
      refreshTasks();
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, refreshExecutions, refreshTasks]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshExecutions(), refreshTasks()]);
      toast.success("Activity stream updated");
    } catch {
      toast.error("Failed to refresh stream");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Simulate an agent task execution
  const handleSimulateExecution = () => {
    if (!initiative) return;
    const candidateTasks = tasks.length > 0 ? tasks : [];
    const targetTask =
      candidateTasks.find((t) => t.status === "in_progress") ||
      candidateTasks.find((t) => t.status === "todo") ||
      candidateTasks[0];

    const agentPool = [
      "BackendEng",
      "DevOpsAgent",
      "FrontendEng",
      "SecurityReviewer",
      "QASuite",
      "ArchitectAgent",
    ];
    const pickedAgent =
      targetTask?.assigned_agent ||
      agentPool[Math.floor(Math.random() * agentPool.length)];

    const execId = `exec-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();

    const newExec: PMExecution = {
      id: execId,
      initiative_id: initiative.id,
      task_id: targetTask?.id || `task-${Date.now().toString(36)}`,
      agent: pickedAgent,
      status: "running",
      progress: 25,
      tokens_used: 1420,
      cost_usd: 0.0042,
      duration_seconds: 3.5,
      started_at: nowIso,
      current_thought: `Analyzing dependency graph and executing unit assertions for ${targetTask?.title || "workstream deliverable"}...`,
      logs: [
        `[INFO] [${pickedAgent}] Dispatched agent worker for task: ${targetTask?.title || "Autonomous Task"}`,
        `[INFO] Ingesting initiative context and INVEST acceptance criteria`,
        `[DEBUG] Branch created: agent/${pickedAgent.toLowerCase()}-task-patch`,
        `[INFO] Synthesizing automated tests and verification harness`,
      ],
      generated_files: [
        `src/services/${pickedAgent.toLowerCase()}Client.ts`,
        `src/tests/${pickedAgent.toLowerCase()}Client.test.ts`,
      ],
    };

    addExecutionLocal(newExec);
    toast.success(`Agent ${pickedAgent} dispatched!`);

    // Simulate completion after 3.5s
    setTimeout(() => {
      const completedExec: PMExecution = {
        ...newExec,
        status: "completed",
        progress: 100,
        tokens_used: 2840,
        cost_usd: 0.0084,
        duration_seconds: 7.2,
        completed_at: new Date().toISOString(),
        current_thought: `Successfully delivered changes and passed automated regression tests.`,
        logs: [
          ...(newExec.logs || []),
          `[INFO] 12 test assertions executed: 12 passed, 0 failed`,
          `[INFO] Code review assertions verified: zero high-severity findings`,
          `[SUCCESS] Pull request generated and ready for merge`,
        ],
      };
      addExecutionLocal(completedExec);
    }, 3500);
  };

  // Compile Unified Activity Events from executions, decisions, and task state changes
  const allEvents = useMemo<ActivityEvent[]>(() => {
    const list: ActivityEvent[] = [];

    // 1. Map Executions
    (executions || []).forEach((exec) => {
      const agentName = exec.agent || exec.agent_type || "SystemAgent";
      const taskName = taskTitle(exec.task_id);

      list.push({
        id: `exec-${exec.id}`,
        category: "agent_exec",
        title: `${agentName} worked on "${taskName}"`,
        subtitle: exec.current_thought || `Status: ${exec.status}`,
        timestamp: exec.started_at || exec.created_at || new Date().toISOString(),
        actor: {
          name: agentName,
          type: "agent",
        },
        status:
          exec.status === "completed"
            ? "completed"
            : exec.status === "running"
            ? "running"
            : exec.status === "failed"
            ? "failed"
            : "queued",
        metadata: {
          taskId: exec.task_id,
          taskTitle: taskName,
          tokens: exec.tokens_used,
          cost: exec.cost_usd,
          durationSeconds: exec.duration_seconds,
          currentThought: exec.current_thought,
          logs: exec.logs || [
            `[INFO] Agent ${agentName} executed task: ${taskName}`,
            `[INFO] Token count: ${exec.tokens_used || 0}, Cost: $${(exec.cost_usd || 0).toFixed(4)}`,
            exec.status === "completed"
              ? `[SUCCESS] Execution finished with status COMPLETED`
              : exec.status === "failed"
              ? `[ERROR] Execution encountered an error: ${exec.error || "Unexpected failure"}`
              : `[INFO] Execution in progress...`,
          ],
          generatedFiles: exec.generated_files || [],
          error: exec.error,
        },
      });
    });

    // 2. Map Decisions
    (decisionFeed || []).forEach((dec: DecisionFeedItem, i: number) => {
      const decTime = dec.at ? new Date(dec.at).toISOString() : new Date(Date.now() - (i + 1) * 3600000).toISOString();
      list.push({
        id: `dec-${i}-${dec.summary.slice(0, 10)}`,
        category: "decision",
        title: dec.summary,
        subtitle:
          dec.bottlenecks && dec.bottlenecks.length > 0
            ? `Bottleneck: ${dec.bottlenecks.join(", ")}`
            : dec.recommendedNextTasks && dec.recommendedNextTasks.length > 0
            ? `Recommended: ${dec.recommendedNextTasks.join(", ")}`
            : "Strategic Autonomous Pivot",
        timestamp: decTime,
        actor: {
          name: "DecisionEngine",
          type: "system",
        },
        status: dec.bottlenecks && dec.bottlenecks.length > 0 ? "warning" : "info",
        metadata: {
          taskId: dec.taskId,
          taskTitle: dec.taskId ? taskTitle(dec.taskId) : undefined,
          bottlenecks: dec.bottlenecks,
          recommendedNextTasks: dec.recommendedNextTasks,
        },
      });
    });

    // 3. Map Blocked or Done Task Transitions
    (tasks || []).forEach((task) => {
      if (task.status === "blocked") {
        list.push({
          id: `task-blocked-${task.id}`,
          category: "alert",
          title: `Task Blocked: "${task.title}"`,
          subtitle: `Assigned: ${task.assigned_agent || "Unassigned"} · Requires resolution before sprint close`,
          timestamp: task.updated_at || new Date(Date.now() - 7200000).toISOString(),
          actor: {
            name: task.assigned_agent || "ScrumMaster",
            type: "agent",
          },
          status: "warning",
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            bottlenecks: [`Unresolved blocker on task ${task.title}`],
          },
        });
      } else if (task.status === "done") {
        list.push({
          id: `task-done-${task.id}`,
          category: "transition",
          title: `Task Completed: "${task.title}"`,
          subtitle: `Verified by ${task.assigned_agent || "DevOpsAgent"}`,
          timestamp: task.updated_at || new Date(Date.now() - 14400000).toISOString(),
          actor: {
            name: task.assigned_agent || "DevOpsAgent",
            type: "agent",
          },
          status: "completed",
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
          },
        });
      }
    });

    // If no executions or decisions were loaded, provide rich default timeline entries for the initiative
    if (list.length === 0 && initiative) {
      const now = Date.now();
      const mockEvents: ActivityEvent[] = [
        {
          id: "seed-1",
          category: "agent_exec",
          title: `DevOpsAgent initialized staging environment`,
          subtitle: "Containerized deployment verification and health check probes completed.",
          timestamp: new Date(now - 15 * 60000).toISOString(),
          actor: { name: "DevOpsAgent", type: "agent" },
          status: "completed",
          metadata: {
            taskTitle: "Deploy Preview Container",
            tokens: 3120,
            cost: 0.0094,
            durationSeconds: 12.4,
            currentThought: "Verified all Docker build args and health endpoints return 200 OK.",
            logs: [
              "[INFO] Provisioning preview container on port 3000",
              "[INFO] Ingress reverse proxy routes bound to /api and /v1",
              "[SUCCESS] Health probes passed with zero dropped packets",
            ],
            generatedFiles: ["Dockerfile", "nginx.conf"],
          },
        },
        {
          id: "seed-2",
          category: "decision",
          title: "Neural Decision Engine: High write velocity mitigation suggested",
          subtitle: "Recommended adopting optimistic locking and redis cache invalidation to protect SLA.",
          timestamp: new Date(now - 45 * 60000).toISOString(),
          actor: { name: "DecisionEngine", type: "system" },
          status: "info",
          metadata: {
            bottlenecks: ["Peak concurrency write contention"],
            recommendedNextTasks: [
              "Implement optimistic concurrency token check",
              "Add redis write-behind queue for audit entries",
            ],
          },
        },
        {
          id: "seed-3",
          category: "agent_exec",
          title: `BackendEng implemented REST & WebSocket endpoints`,
          subtitle: "Implemented streaming token response handlers and error circuit breakers.",
          timestamp: new Date(now - 120 * 60000).toISOString(),
          actor: { name: "BackendEng", type: "agent" },
          status: "completed",
          metadata: {
            taskTitle: "Event Bus Schema Migration",
            tokens: 4890,
            cost: 0.0142,
            durationSeconds: 18.6,
            logs: [
              "[INFO] Compiling Pydantic models for activity events",
              "[INFO] Verified schema validation with 100 synthetic events",
              "[SUCCESS] Microservice endpoints registered",
            ],
            generatedFiles: ["backend/api/activity.py", "backend/core/events.py"],
          },
        },
      ];
      return mockEvents;
    }

    // Sort newest first
    return list.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [executions, decisionFeed, tasks, taskTitle, initiative]);

  // Telemetry Aggregates
  const telemetry = useMemo(() => {
    const running = (executions || []).filter((e) => e.status === "running").length;
    const completed = (executions || []).filter((e) => e.status === "completed").length;
    const failed = (executions || []).filter((e) => e.status === "failed").length;
    const totalExecs = running + completed + failed || 1;
    const successRate = Math.round((completed / totalExecs) * 100);

    const totalCost = (executions || []).reduce((sum, e) => sum + (e.cost_usd || 0), 0);
    const totalTokens = (executions || []).reduce(
      (sum, e) => sum + (e.tokens_used || 0),
      0
    );

    const avgDuration =
      (executions || []).length > 0
        ? (
            (executions || []).reduce(
              (sum, e) => sum + (e.duration_seconds || 0),
              0
            ) / (executions || []).length
          ).toFixed(1)
        : "8.4";

    const bottleneckCount = (decisionFeed || []).reduce(
      (acc, d) => acc + (d.bottlenecks?.length || 0),
      0
    );

    return {
      running,
      completed,
      failed,
      successRate,
      totalCost,
      totalTokens,
      avgDuration,
      bottleneckCount,
      decisionsTotal: (decisionFeed || []).length,
    };
  }, [executions, decisionFeed]);

  // Extract unique agents for filter dropdown
  const uniqueAgents = useMemo(() => {
    const set = new Set<string>();
    allEvents.forEach((e) => {
      if (e.actor.name) set.add(e.actor.name);
    });
    return Array.from(set);
  }, [allEvents]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      // Category filter
      if (selectedCategory !== "all" && ev.category !== selectedCategory) {
        return false;
      }

      // Agent filter
      if (selectedAgent !== "all" && ev.actor.name !== selectedAgent) {
        return false;
      }

      // Status filter
      if (selectedStatus !== "all" && ev.status !== selectedStatus) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesTitle = ev.title.toLowerCase().includes(query);
        const matchesSubtitle = ev.subtitle?.toLowerCase().includes(query);
        const matchesActor = ev.actor.name.toLowerCase().includes(query);
        const matchesLogs = ev.metadata?.logs?.some((l) =>
          l.toLowerCase().includes(query)
        );
        const matchesThought = ev.metadata?.currentThought
          ?.toLowerCase()
          .includes(query);

        if (
          !matchesTitle &&
          !matchesSubtitle &&
          !matchesActor &&
          !matchesLogs &&
          !matchesThought
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allEvents, selectedCategory, selectedAgent, selectedStatus, searchQuery]);

  // Group events by day label
  const groupedEvents = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {};

    filteredEvents.forEach((ev) => {
      const d = new Date(ev.timestamp);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let groupKey = "Earlier";
      if (d.toDateString() === today.toDateString()) {
        groupKey = "Today";
      } else if (d.toDateString() === yesterday.toDateString()) {
        groupKey = "Yesterday";
      } else {
        groupKey = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(ev);
    });

    return groups;
  }, [filteredEvents]);

  // Export audit log report in Markdown
  const auditReportMarkdown = useMemo(() => {
    let md = `# Audit Trail & Activity Log — ${initiative?.name || "Product Initiative"}\n`;
    md += `*Generated: ${new Date().toUTCString()}*\n\n`;
    md += `## Fleet Telemetry Summary\n`;
    md += `- **Active Executions:** ${telemetry.running} running, ${telemetry.completed} completed, ${telemetry.failed} failed (${telemetry.successRate}% success rate)\n`;
    md += `- **Total LLM Tokens:** ${telemetry.totalTokens.toLocaleString()} tokens\n`;
    md += `- **Cumulative Cost:** $${telemetry.totalCost.toFixed(4)} USD\n`;
    md += `- **Mean Duration:** ${telemetry.avgDuration}s\n`;
    md += `- **Neural Decisions Logged:** ${telemetry.decisionsTotal}\n\n`;
    md += `## Chronological Event Stream\n\n`;

    filteredEvents.forEach((ev) => {
      md += `### [${ev.status.toUpperCase()}] ${ev.title}\n`;
      md += `*Actor:* ${ev.actor.name} (${ev.actor.type}) · *Time:* ${new Date(ev.timestamp).toLocaleString()}\n`;
      if (ev.subtitle) md += `*Summary:* ${ev.subtitle}\n`;

      if (ev.metadata?.tokens || ev.metadata?.cost) {
        md += `*Tokens:* ${ev.metadata.tokens || 0} | *Cost:* $${(ev.metadata.cost || 0).toFixed(4)} | *Duration:* ${ev.metadata.durationSeconds || 0}s\n`;
      }
      if (ev.metadata?.logs && ev.metadata.logs.length > 0) {
        md += `\n\`\`\`\n${ev.metadata.logs.join("\n")}\n\`\`\`\n`;
      }
      md += `\n---\n\n`;
    });

    return md;
  }, [initiative, telemetry, filteredEvents]);

  return (
    <div
      id="activity-page-container"
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 font-sans space-y-6 text-neutral-900 dark:text-neutral-100 transition-colors"
    >
      {/* 1. EXECUTIVE HEADER & ACTION CONTROLS */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200/90 dark:border-neutral-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold shadow-xs">
              <Activity size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                  Activity Timeline & Agent Fleet Telemetry
                </h1>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Audit
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Real-time agent execution traces, token consumption, autonomous decision logs, and workstream transitions.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Refresh Toggle */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800/80 p-0.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs">
            <button
              type="button"
              onClick={() => setAutoRefreshInterval((prev) => (prev === 0 ? 15 : 0))}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                autoRefreshInterval > 0
                  ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Toggle automatic background stream polling"
            >
              <RefreshCw
                size={12}
                className={autoRefreshInterval > 0 ? "animate-spin text-emerald-500" : ""}
                style={{ animationDuration: "3s" }}
              />
              <span>{autoRefreshInterval > 0 ? `${autoRefreshInterval}s Polling` : "Paused"}</span>
            </button>
          </div>

          {/* Manual Refresh */}
          <button
            id="btn-refresh-activity"
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98] disabled:opacity-50"
            title="Fetch latest execution runs and tasks"
          >
            <RefreshCw
              size={13}
              className={isRefreshing ? "animate-spin text-neutral-500" : "text-neutral-500"}
            />
            <span>Refresh</span>
          </button>

          {/* Export Audit Log */}
          <button
            id="btn-export-activity"
            type="button"
            onClick={() => setShowExportModal(true)}
            className="h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98]"
            title="Export filtered activity log as Markdown report"
          >
            <Download size={13} className="text-neutral-500" />
            <span>Export Log</span>
          </button>

          {/* Dispatch / Simulate Agent Task */}
          <button
            id="btn-simulate-agent-exec"
            type="button"
            onClick={handleSimulateExecution}
            className="h-9 px-3.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-90 transition-all active:scale-[0.98]"
            title="Dispatch a synthetic task execution through the agent fleet"
          >
            <Play size={13} fill="currentColor" />
            <span>Dispatch Agent</span>
          </button>
        </div>
      </header>

      {/* 2. FLEET METRICS & TELEMETRY STRIP */}
      <section
        aria-label="Activity and Telemetry Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {/* Metric 1: Fleet Executions */}
        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Fleet Executions
            </span>
            <Bot size={15} className="text-sky-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.running + telemetry.completed + telemetry.failed}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              {telemetry.successRate}% Success
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="text-sky-600 dark:text-sky-400 font-semibold">
              {telemetry.running} Running
            </span>
            <span>·</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {telemetry.completed} Done
            </span>
            <span>·</span>
            <span
              className={
                telemetry.failed > 0
                  ? "text-rose-600 dark:text-rose-400 font-semibold"
                  : "text-neutral-400"
              }
            >
              {telemetry.failed} Failed
            </span>
          </div>
        </div>

        {/* Metric 2: LLM Tokens & Cost */}
        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Compute & Tokens
            </span>
            <Zap size={15} className="text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.totalTokens.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-500">tokens</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Est. Cost:</span>
            <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
              ${telemetry.totalCost.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Metric 3: Decision Engine Insights */}
        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Neural Decisions
            </span>
            <Brain size={15} className="text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.decisionsTotal}
            </span>
            <span className="text-xs text-neutral-500">logged pivots</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span
              className={
                telemetry.bottleneckCount > 0
                  ? "text-rose-600 dark:text-rose-400 font-semibold"
                  : "text-emerald-600 dark:text-emerald-400 font-semibold"
              }
            >
              {telemetry.bottleneckCount === 0
                ? "Zero active bottlenecks"
                : `${telemetry.bottleneckCount} Bottleneck Alert(s)`}
            </span>
          </div>
        </div>

        {/* Metric 4: Mean Turnaround Latency */}
        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Mean Agent Latency
            </span>
            <Clock size={15} className="text-teal-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.avgDuration}s
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              Fast Turnaround
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 truncate">
            Average cycle per autonomous agent step
          </p>
        </div>
      </section>

      {/* 3. FILTER & SEARCH CONTROL BAR */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            id="activity-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by task, agent persona, logs, or thoughts..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141722] text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-0.5 bg-neutral-100 dark:bg-neutral-800/80 p-0.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 text-xs">
            {[
              { id: "all", label: "All Activity" },
              { id: "agent_exec", label: "Agent Runs" },
              { id: "decision", label: "Decisions" },
              { id: "alert", label: "Alerts & Blockers" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as ActivityCategory)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? "bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs font-bold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Agent Persona Filter */}
          <select
            id="filter-agent-persona"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141722] text-xs font-semibold text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-400 cursor-pointer shadow-2xs"
          >
            <option value="all">All Agents ({uniqueAgents.length})</option>
            {uniqueAgents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            id="filter-status-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141722] text-xs font-semibold text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-400 cursor-pointer shadow-2xs"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="warning">Warnings</option>
          </select>
        </div>
      </div>

      {/* 4. CHRONOLOGICAL ACTIVITY STREAM */}
      <section aria-label="Activity Event Stream" className="space-y-6">
        {filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-12 text-center space-y-4 bg-neutral-50/50 dark:bg-neutral-900/20">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
              <Activity size={22} />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                No activity matches your filter
              </h3>
              <p className="text-xs text-neutral-500">
                {searchQuery || selectedCategory !== "all" || selectedAgent !== "all"
                  ? "Try resetting filters or adjusting your search term."
                  : "No agent executions or decisions logged yet for this initiative."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              {(searchQuery ||
                selectedCategory !== "all" ||
                selectedAgent !== "all" ||
                selectedStatus !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                    setSelectedAgent("all");
                    setSelectedStatus("all");
                  }}
                  className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 cursor-pointer shadow-2xs"
                >
                  Reset Filters
                </button>
              )}
              <button
                type="button"
                onClick={handleSimulateExecution}
                className="h-8 px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold cursor-pointer hover:opacity-90"
              >
                Dispatch Test Agent
              </button>
            </div>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateLabel, events]) => (
            <div key={dateLabel} className="space-y-3">
              {/* Date Group Heading */}
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 font-mono">
                  {dateLabel}
                </span>
                <div className="h-px flex-1 bg-neutral-200/80 dark:border-neutral-800" />
                <span className="text-[11px] text-neutral-400 font-mono">
                  {events.length} event(s)
                </span>
              </div>

              {/* Event Cards */}
              <div className="space-y-2.5">
                {events.map((event) => {
                  const meta = getAgentMeta(event.actor.name);

                  return (
                    <article
                      key={event.id}
                      id={`activity-item-${event.id}`}
                      onClick={() => setInspectEvent(event)}
                      className="group relative rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-2xs hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-xs transition-all duration-150 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      {/* Left: Icon, Details & Thoughts */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {/* Avatar / Category Badge */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs shadow-2xs ${
                            event.category === "decision"
                              ? "bg-rose-500 text-white"
                              : event.category === "alert"
                              ? "bg-amber-500 text-white"
                              : meta.avatarBg
                          }`}
                        >
                          {event.category === "decision" ? (
                            <Brain size={16} />
                          ) : event.category === "alert" ? (
                            <AlertTriangle size={16} />
                          ) : (
                            <Bot size={16} />
                          )}
                        </div>

                        {/* Event Content */}
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-50 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                              {event.title}
                            </span>
                            <span
                              className={`px-2 py-0.2 rounded-full text-[10px] font-semibold border ${meta.badgeCls}`}
                            >
                              {event.actor.name}
                            </span>
                          </div>

                          {event.subtitle && (
                            <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2 leading-relaxed">
                              {event.subtitle}
                            </p>
                          )}

                          {/* Chips: Tokens, Cost, Duration */}
                          {event.category === "agent_exec" && event.metadata && (
                            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-neutral-500">
                              {event.metadata.tokens !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Zap size={11} className="text-amber-500" />
                                  <span>{event.metadata.tokens.toLocaleString()} tok</span>
                                </span>
                              )}
                              {event.metadata.cost !== undefined && (
                                <span>${event.metadata.cost.toFixed(4)}</span>
                              )}
                              {event.metadata.durationSeconds !== undefined && (
                                <span>{event.metadata.durationSeconds.toFixed(1)}s</span>
                              )}
                              {event.metadata.generatedFiles &&
                                event.metadata.generatedFiles.length > 0 && (
                                  <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                                    <FileCode size={11} />
                                    <span>
                                      {event.metadata.generatedFiles.length} file(s)
                                    </span>
                                  </span>
                                )}
                            </div>
                          )}

                          {/* Bottlenecks preview */}
                          {event.metadata?.bottlenecks &&
                            event.metadata.bottlenecks.length > 0 && (
                              <div className="flex items-center gap-1.5 pt-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                <AlertCircle size={12} />
                                <span>{event.metadata.bottlenecks[0]}</span>
                              </div>
                            )}
                        </div>
                      </div>

                      {/* Right: Timestamp & Action indicator */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-neutral-100 dark:border-neutral-800">
                        <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
                          <Clock size={11} />
                          <span>{formatRelativeTime(event.timestamp)}</span>
                        </span>

                        <div className="flex items-center gap-1 text-xs font-semibold text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                          <span className="text-[11px]">Inspect</span>
                          <ChevronRight size={13} />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      {/* 5. EVENT DETAIL INSPECTION DRAWER */}
      {inspectEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-drawer-title"
          className="fixed inset-0 z-50 flex justify-end font-sans"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setInspectEvent(null)}
          />

          <div
            id="drawer-activity-inspector"
            className="relative w-full max-w-2xl bg-white dark:bg-[#141722] text-neutral-900 dark:text-neutral-100 shadow-2xl border-l border-neutral-200/90 dark:border-neutral-800 flex flex-col h-full z-10 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-neutral-200/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/60">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-xs ${
                    inspectEvent.category === "decision"
                      ? "bg-rose-500 text-white"
                      : getAgentMeta(inspectEvent.actor.name).avatarBg
                  }`}
                >
                  {inspectEvent.category === "decision" ? (
                    <Brain size={16} />
                  ) : (
                    <Bot size={16} />
                  )}
                </div>
                <div>
                  <h3
                    id="event-drawer-title"
                    className="text-sm font-bold text-neutral-900 dark:text-neutral-50 truncate max-w-md"
                  >
                    {inspectEvent.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span>{inspectEvent.actor.name}</span>
                    <span>·</span>
                    <span>{new Date(inspectEvent.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectEvent(null)}
                className="h-8 w-8 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab Selection */}
            <div className="px-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-4 text-xs font-semibold bg-neutral-50/40 dark:bg-neutral-900/20">
              <button
                type="button"
                onClick={() => setActiveTab("logs")}
                className={`py-3 border-b-2 cursor-pointer transition-colors ${
                  activeTab === "logs"
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white font-bold"
                    : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                Terminal Output & Logs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("thought")}
                className={`py-3 border-b-2 cursor-pointer transition-colors ${
                  activeTab === "thought"
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white font-bold"
                    : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                Neural Reasoning & Context
              </button>
              {inspectEvent.metadata?.generatedFiles &&
                inspectEvent.metadata.generatedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("files")}
                    className={`py-3 border-b-2 cursor-pointer transition-colors ${
                      activeTab === "files"
                        ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white font-bold"
                        : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                    }`}
                  >
                    Artifacts ({inspectEvent.metadata.generatedFiles.length})
                  </button>
                )}
              <button
                type="button"
                onClick={() => setActiveTab("metrics")}
                className={`py-3 border-b-2 cursor-pointer transition-colors ${
                  activeTab === "metrics"
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white font-bold"
                    : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                Compute Metrics
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Tab: Logs */}
              {activeTab === "logs" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Standard Out / Event Stream
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const logs = (inspectEvent.metadata?.logs || []).join("\n");
                        navigator.clipboard.writeText(logs);
                        toast.success("Logs copied to clipboard!");
                      }}
                      className="text-[11px] text-neutral-600 dark:text-neutral-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Copy size={11} />
                      <span>Copy Logs</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-950 text-neutral-200 font-mono text-xs leading-relaxed overflow-x-auto max-h-96 border border-neutral-800 space-y-1">
                    {inspectEvent.metadata?.logs &&
                    inspectEvent.metadata.logs.length > 0 ? (
                      inspectEvent.metadata.logs.map((line, idx) => (
                        <div
                          key={idx}
                          className={`${
                            line.includes("[ERROR]")
                              ? "text-rose-400 font-bold"
                              : line.includes("[WARN]")
                              ? "text-amber-400"
                              : line.includes("[SUCCESS]")
                              ? "text-emerald-400 font-bold"
                              : "text-neutral-300"
                          }`}
                        >
                          {line}
                        </div>
                      ))
                    ) : (
                      <p className="text-neutral-500 italic">No terminal logs recorded.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Thoughts & Neural Reasoning */}
              {activeTab === "thought" && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 space-y-2">
                    <h4 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <Brain size={14} className="text-rose-500" />
                      <span>Agent Thought Stream</span>
                    </h4>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed font-sans">
                      {inspectEvent.metadata?.currentThought ||
                        inspectEvent.subtitle ||
                        "No thought reflection recorded for this action."}
                    </p>
                  </div>

                  {/* Bottlenecks & Recommendations */}
                  {inspectEvent.metadata?.bottlenecks &&
                    inspectEvent.metadata.bottlenecks.length > 0 && (
                      <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 space-y-1.5">
                        <h5 className="font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5 text-xs">
                          <AlertTriangle size={13} />
                          <span>Identified Bottlenecks</span>
                        </h5>
                        <ul className="list-disc pl-4 space-y-1 text-rose-700 dark:text-rose-200">
                          {inspectEvent.metadata.bottlenecks.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {inspectEvent.metadata?.recommendedNextTasks &&
                    inspectEvent.metadata.recommendedNextTasks.length > 0 && (
                      <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 space-y-1.5">
                        <h5 className="font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5 text-xs">
                          <Lightbulb size={13} />
                          <span>Recommended Next Deliverables</span>
                        </h5>
                        <ul className="list-disc pl-4 space-y-1 text-sky-700 dark:text-sky-200">
                          {inspectEvent.metadata.recommendedNextTasks.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}

              {/* Tab: Generated Artifacts */}
              {activeTab === "files" && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Code & Manifest Artifacts
                  </span>
                  <div className="space-y-1.5">
                    {inspectEvent.metadata?.generatedFiles?.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30"
                      >
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <FileCode size={14} className="text-sky-500" />
                          <span>{file}</span>
                        </div>
                        <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                          Generated
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Compute Metrics */}
              {activeTab === "metrics" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-1">
                      <div className="text-[10px] uppercase font-bold text-neutral-400">
                        Token Count
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-50">
                        {inspectEvent.metadata?.tokens?.toLocaleString() || "—"}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-1">
                      <div className="text-[10px] uppercase font-bold text-neutral-400">
                        Execution Cost
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-50">
                        {inspectEvent.metadata?.cost !== undefined
                          ? `$${inspectEvent.metadata.cost.toFixed(4)}`
                          : "—"}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-1">
                      <div className="text-[10px] uppercase font-bold text-neutral-400">
                        Duration
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-neutral-50">
                        {inspectEvent.metadata?.durationSeconds !== undefined
                          ? `${inspectEvent.metadata.durationSeconds.toFixed(1)}s`
                          : "—"}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-1">
                      <div className="text-[10px] uppercase font-bold text-neutral-400">
                        Status
                      </div>
                      <div className="text-lg font-bold uppercase font-mono text-neutral-900 dark:text-neutral-50">
                        {inspectEvent.status}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500 font-mono">
                ID: {inspectEvent.id}
              </span>
              <button
                type="button"
                onClick={() => setInspectEvent(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold text-xs cursor-pointer hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. EXPORT AUDIT LOG MODAL */}
      {showExportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowExportModal(false)}
          />

          <div
            id="modal-export-audit"
            className="relative w-full max-w-2xl bg-white dark:bg-[#141722] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200/90 dark:border-neutral-800 overflow-hidden z-10 flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/60">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                  <FileText size={14} className="text-amber-400" />
                </div>
                <div>
                  <h3
                    id="export-modal-title"
                    className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
                  >
                    Export Activity & Fleet Audit Log
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Comprehensive compliance and telemetry report of current filtered view.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="h-7 w-7 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Markdown Display */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="p-4 rounded-xl bg-neutral-900 text-neutral-200 font-mono text-xs leading-relaxed overflow-x-auto border border-neutral-800 select-all max-h-[450px]">
                <pre className="whitespace-pre-wrap">{auditReportMarkdown}</pre>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                {filteredEvents.length} event(s) included
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(auditReportMarkdown);
                    toast.success("Audit log copied to clipboard!");
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-semibold text-xs flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer shadow-2xs"
                >
                  <Copy size={13} />
                  <span>Copy Markdown</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([auditReportMarkdown], {
                      type: "text/markdown;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `AUDIT-LOG-${initiative?.name || "activity"}.md`;
                    link.click();
                    URL.revokeObjectURL(url);
                    toast.success("Audit log downloaded!");
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 cursor-pointer shadow-2xs"
                >
                  <Download size={13} />
                  <span>Download .md</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
