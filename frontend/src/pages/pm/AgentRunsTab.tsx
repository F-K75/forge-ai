import React, { useEffect, useState, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { Bot, RefreshCw } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { sprintsApi } from "../../lib/pmApi";
import { LIVE_MODE } from "../../lib/env";
import { runScrumStandupWithGemini } from "../../lib/geminiPM";
import { gatewayAgentById, GATEWAY_AGENTS } from "../../lib/gatewayAgents";

import { BusinessAnalystPane } from "../../components/agentRun/panes/BusinessAnalystPane";
import { DecisionEnginePane } from "../../components/agentRun/panes/DecisionEnginePane";
import { PrdWriterPane } from "../../components/agentRun/panes/PrdWriterPane";
import { EpicGeneratorPane } from "../../components/agentRun/panes/EpicGeneratorPane";
import { StoryGeneratorPane } from "../../components/agentRun/panes/StoryGeneratorPane";
import { TaskGeneratorPane } from "../../components/agentRun/panes/TaskGeneratorPane";
import { SprintPlannerPane } from "../../components/agentRun/panes/SprintPlannerPane";
import { ScrumMasterPane } from "../../components/agentRun/panes/ScrumMasterPane";
import { TaskExecutorPane } from "../../components/agentRun/panes/TaskExecutorPane";
import { IntegrationPane } from "../../components/agentRun/panes/IntegrationPane";
import { DesignPane } from "../../components/agentRun/panes/DesignPane";

import { AgentRunHeader } from "./agentRun/AgentRunHeader";
import {
  AgentRunFilterBar,
  type AgentRunViewMode,
  type StageFilter,
} from "./agentRun/AgentRunFilterBar";
import { AgentRunCard, type RunStatus } from "./agentRun/AgentRunCard";
import { AgentConsoleView } from "./agentRun/AgentConsoleView";
import { AgentDecisionsView } from "./agentRun/AgentDecisionsView";
import { AgentFleetMatrixView } from "./agentRun/AgentFleetMatrixView";
import { AgentPayloadModal } from "./agentRun/AgentPayloadModal";

const PRIORITY_LABEL: Record<string, "P0" | "P1" | "P2"> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P2",
};

const AGENT_EXEC_STATUS: Record<string, RunStatus> = {
  queued: "needs_review",
  running: "running",
  completed: "done",
  failed: "needs_review",
};

function EmptyPane({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-5 text-center">
      <p className="text-xs text-slate-500 dark:text-slate-400">{children}</p>
    </div>
  );
}

export default function AgentRunsTab() {
  const {
    initiative,
    prd,
    epics,
    stories,
    tasks,
    sprints,
    executions,
    decisionFeed,
    loading,
  } = usePMStore();

  const [standup, setStandup] = useState<Record<string, any> | null>(null);
  const [standupLoading, setStandupLoading] = useState(false);

  // Navigation & Filter State
  const [viewMode, setViewMode] = useState<AgentRunViewMode>("pipeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<StageFilter>("all");
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    business_analyst: true,
    decision_engine: true,
    prd_writer: true,
    designer: true,
    epic_generator: true,
    story_generator: true,
    task_generator: true,
    sprint_planner: true,
    scrum_master: true,
    task_executor: true,
    integration: true,
  });

  // Modal State
  const [payloadModal, setPayloadModal] = useState<{
    isOpen: boolean;
    title: string;
    agentName: string;
    payload: any;
  }>({
    isOpen: false,
    title: "",
    agentName: "",
    payload: null,
  });

  const latestSprint = sprints[0];

  useEffect(() => {
    if (!latestSprint) return;
    sprintsApi
      .standups(latestSprint.id)
      .then((rows: any[]) => setStandup(rows?.[0] ?? null))
      .catch(() => setStandup(null));
  }, [latestSprint]);

  const runStandup = async () => {
    if (!latestSprint) {
      toast.error("No active sprint found to run standup");
      return;
    }
    setStandupLoading(true);
    try {
      if (LIVE_MODE) {
        const s = await sprintsApi.standup(latestSprint.id);
        setStandup(s);
      } else {
        const s = await runScrumStandupWithGemini(latestSprint, tasks);
        setStandup(s);
      }
      toast.success("Scrum Master Agent posted live standup!");
    } catch {
      toast.error("Couldn't run the standup.");
    } finally {
      setStandupLoading(false);
    }
  };

  const handleSimulateRun = useCallback(() => {
    toast.success("Simulating autonomous agent workflow step...");
  }, []);

  const handleExportAudit = useCallback(() => {
    if (!initiative) return;
    const auditData = {
      initiative: {
        id: initiative.id,
        name: initiative.name,
        status: initiative.status,
      },
      exported_at: new Date().toISOString(),
      agents_count: GATEWAY_AGENTS.length,
      executions: executions,
      decisions: decisionFeed,
      standup: standup,
    };

    const blob = new Blob([JSON.stringify(auditData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent_run_audit_${initiative.id?.slice(0, 8) || "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Pipeline audit report exported successfully");
  }, [initiative, executions, decisionFeed, standup]);

  const toggleCard = (agentId: string) => {
    setExpandedCards((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  const allExpanded = useMemo(() => {
    return Object.values(expandedCards).every(Boolean);
  }, [expandedCards]);

  const handleToggleExpandAll = () => {
    const nextState = !allExpanded;
    const updated: Record<string, boolean> = {};
    GATEWAY_AGENTS.forEach((a) => {
      updated[a.id] = nextState;
    });
    setExpandedCards(updated);
  };

  const openInspectModal = (title: string, agentName: string, payload: any) => {
    setPayloadModal({
      isOpen: true,
      title,
      agentName,
      payload,
    });
  };

  // Agent Count by Stage
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Discovery: 0,
      Definition: 0,
      Planning: 0,
      Execution: 0,
    };
    GATEWAY_AGENTS.forEach((a) => {
      if (counts[a.stage] !== undefined) {
        counts[a.stage] += 1;
      }
    });
    return counts;
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center text-sm text-slate-500">
        Loading autonomous agent runs…
      </div>
    );
  }

  if (!initiative) return null;

  const ba = gatewayAgentById("business_analyst")!;
  const dec = gatewayAgentById("decision_engine")!;
  const prdAgent = gatewayAgentById("prd_writer")!;
  const epicAgent = gatewayAgentById("epic_generator")!;
  const storyAgent = gatewayAgentById("story_generator")!;
  const taskAgent = gatewayAgentById("task_generator")!;
  const sprintAgent = gatewayAgentById("sprint_planner")!;
  const scrumAgent = gatewayAgentById("scrum_master")!;
  const execAgent = gatewayAgentById("task_executor")!;
  const integrationAgent = gatewayAgentById("integration")!;
  const designerAgent = gatewayAgentById("designer")!;
  const techStack: string[] = initiative.tech_stack ?? [];

  const latestDecision = decisionFeed[0];
  const latestExecution = executions[0];

  const runningCount = executions.filter((e) => e.status === "running").length;
  const completedCount = GATEWAY_AGENTS.length - (runningCount > 0 ? 1 : 0);

  // Filter helper
  const matchesFilter = (agentId: string, stage: string, label: string, purpose: string) => {
    if (selectedStage !== "all" && stage !== selectedStage) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        label.toLowerCase().includes(q) ||
        purpose.toLowerCase().includes(q) ||
        agentId.toLowerCase().includes(q)
      );
    }
    return true;
  };

  return (
    <div id="agent-runs-root" className="space-y-6 pb-16 animate-in fade-in duration-200">
      {/* 1. Executive Telemetry & Progression Header */}
      <AgentRunHeader
        initiative={initiative}
        executions={executions}
        standupLoading={standupLoading}
        onRunStandup={runStandup}
        onExportAudit={handleExportAudit}
        onSimulateRun={handleSimulateRun}
        totalAgents={GATEWAY_AGENTS.length}
        completedAgents={completedCount}
        runningAgents={runningCount}
      />

      {/* 2. Unified Navigation Bar, Stage Filter & Search */}
      <AgentRunFilterBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedStage={selectedStage}
        onStageChange={setSelectedStage}
        allExpanded={allExpanded}
        onToggleExpandAll={handleToggleExpandAll}
        stageCounts={stageCounts}
        totalAgents={GATEWAY_AGENTS.length}
      />

      {/* 3. Conditional Workspace Views */}
      {viewMode === "console" && (
        <AgentConsoleView executions={executions} initiativeId={initiative.id} />
      )}

      {viewMode === "decisions" && (
        <AgentDecisionsView decisionFeed={decisionFeed} />
      )}

      {viewMode === "matrix" && (
        <AgentFleetMatrixView
          onSelectAgent={(agentId) => {
            setViewMode("pipeline");
            setExpandedCards((prev) => ({ ...prev, [agentId]: true }));
            const el = document.getElementById(`agent-card-${agentId}`);
            if (el && typeof el.scrollIntoView === "function") {
              el.scrollIntoView({ behavior: "smooth" });
            }
          }}
          runningAgentsCount={runningCount}
        />
      )}

      {viewMode === "pipeline" && (
        <div className="space-y-4">
          {/* 1. Business Analyst */}
          {matchesFilter(ba.id, ba.stage, ba.label, ba.purpose) && (
            <AgentRunCard
              agent={ba}
              runTitle={`${ba.label} — ${initiative.name}`}
              runMeta={`initiative_${initiative.id.slice(0, 8)}`}
              status={initiative.status === "generating" ? "running" : "done"}
              sideMetrics={[
                { label: "Status", value: initiative.status || "active" },
                { label: "Personas", value: String((prd?.personas ?? []).length) },
                { label: "Risks Flagged", value: String((initiative.risks ?? []).length) },
              ]}
              modelName="Gemini 2.5 Pro"
              isExpanded={expandedCards[ba.id]}
              onToggleExpand={() => toggleCard(ba.id)}
              onInspectPayload={() =>
                openInspectModal(
                  "Business Analyst Scoped Brief",
                  ba.label,
                  {
                    vision: initiative.vision,
                    personas: prd?.personas,
                    risks: initiative.risks,
                  }
                )
              }
              rawPayload={{
                vision: initiative.vision,
                personas: prd?.personas,
                risks: initiative.risks,
              }}
            >
              {initiative.vision ? (
                <BusinessAnalystPane
                  problem={initiative.vision}
                  users={(prd?.personas ?? []).map(
                    (p: any) => p.name ?? p.role ?? "User"
                  )}
                  assumptions={(initiative.risks ?? []).map((r: any) => ({
                    text: r.description ?? String(r),
                    flagged: true,
                  }))}
                />
              ) : (
                <EmptyPane>No brief generated yet.</EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 2. Decision Engine */}
          {matchesFilter(dec.id, dec.stage, dec.label, dec.purpose) && (
            <AgentRunCard
              agent={dec}
              runTitle={`${dec.label} — live decisions`}
              runMeta="streams via decision_made WS events"
              status={latestDecision ? "done" : "running"}
              statusLabel={
                latestDecision ? "Latest decision" : "Waiting for a task to complete"
              }
              sideMetrics={[
                { label: "Feed size", value: String(decisionFeed.length) },
                {
                  label: "Bottlenecks",
                  value: String(latestDecision?.bottlenecks?.length || 0),
                },
                {
                  label: "Next tasks",
                  value: String(latestDecision?.recommendedNextTasks?.length || 0),
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[dec.id]}
              onToggleExpand={() => toggleCard(dec.id)}
              onInspectPayload={() =>
                openInspectModal("Decision Engine Rationale", dec.label, decisionFeed)
              }
              rawPayload={decisionFeed}
            >
              {latestDecision ? (
                <DecisionEnginePane
                  options={[]}
                  recommendation={
                    latestDecision.summary +
                    (latestDecision.bottlenecks.length
                      ? ` Bottlenecks: ${latestDecision.bottlenecks.join(", ")}.`
                      : "") +
                    (latestDecision.recommendedNextTasks.length
                      ? ` Next: ${latestDecision.recommendedNextTasks.join(", ")}.`
                      : "")
                  }
                />
              ) : (
                <EmptyPane>
                  The decision engine only runs after a task completes — nothing has finished yet.
                </EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 3. PRD Writer */}
          {matchesFilter(prdAgent.id, prdAgent.stage, prdAgent.label, prdAgent.purpose) && (
            <AgentRunCard
              agent={prdAgent}
              runTitle={`${prdAgent.label} — ${initiative.name}`}
              runMeta={prd ? `prd v${prd.version}` : "no prd yet"}
              status={prd ? "done" : "running"}
              sideMetrics={[
                { label: "Version", value: prd ? `v${prd.version}` : "—" },
                { label: "Sections", value: "5 Defined" },
              ]}
              modelName="Gemini 2.5 Pro"
              isExpanded={expandedCards[prdAgent.id]}
              onToggleExpand={() => toggleCard(prdAgent.id)}
              onInspectPayload={() =>
                openInspectModal("PRD Specification Payload", prdAgent.label, prd)
              }
              rawPayload={prd}
            >
              {prd ? (
                <PrdWriterPane
                  sections={[
                    "Executive summary",
                    "Problem",
                    "Solution",
                    "Functional requirements",
                    "Release plan",
                  ]}
                  activeSectionIndex={2}
                  activeHeading="Solution"
                  activeBody={prd.solution || prd.problem_statement || "—"}
                />
              ) : (
                <EmptyPane>PRD hasn't been generated yet.</EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 4. Designer */}
          {matchesFilter(designerAgent.id, designerAgent.stage, designerAgent.label, designerAgent.purpose) && (
            <AgentRunCard
              agent={designerAgent}
              runTitle={`${designerAgent.label} — ${initiative.name}`}
              runMeta={
                Object.keys(initiative.design || {}).length > 0
                  ? "design ready"
                  : "no design yet"
              }
              status={
                Object.keys(initiative.design || {}).length > 0 ? "done" : "running"
              }
              sideMetrics={[
                {
                  label: "Theme",
                  value: initiative.design?.theme ? "Custom" : "System",
                },
                {
                  label: "Components",
                  value: String(Object.keys(initiative.design?.components || {}).length),
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[designerAgent.id]}
              onToggleExpand={() => toggleCard(designerAgent.id)}
              onInspectPayload={() =>
                openInspectModal("Design System Tokens", designerAgent.label, initiative.design)
              }
              rawPayload={initiative.design}
            >
              <DesignPane design={initiative.design || {}} />
            </AgentRunCard>
          )}

          {/* 5. Epic Generator */}
          {matchesFilter(epicAgent.id, epicAgent.stage, epicAgent.label, epicAgent.purpose) && (
            <AgentRunCard
              agent={epicAgent}
              runTitle={`${epicAgent.label} — ${initiative.name}`}
              runMeta={`${epics.length} epics`}
              status="done"
              sideMetrics={[
                { label: "Total Epics", value: String(epics.length) },
                {
                  label: "P0 Priority",
                  value: String(epics.filter((e: any) => e.priority === "p0").length),
                },
              ]}
              modelName="Gemini 2.5 Pro"
              isExpanded={expandedCards[epicAgent.id]}
              onToggleExpand={() => toggleCard(epicAgent.id)}
              onInspectPayload={() =>
                openInspectModal("Epics Decomposition Payload", epicAgent.label, epics)
              }
              rawPayload={epics}
            >
              {epics.length > 0 ? (
                <EpicGeneratorPane
                  epics={epics.map((e: any) => ({
                    title: e.title,
                    area: e.estimated_duration || "—",
                    storyCount: `${
                      stories.filter((s: any) => s.epic_id === e.id).length
                    } stories`,
                    priority: PRIORITY_LABEL[e.priority] ?? "P2",
                  }))}
                />
              ) : (
                <EmptyPane>No epics generated yet.</EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 6. Story Generator */}
          {matchesFilter(storyAgent.id, storyAgent.stage, storyAgent.label, storyAgent.purpose) && (
            <AgentRunCard
              agent={storyAgent}
              runTitle={`${storyAgent.label} — ${initiative.name}`}
              runMeta={`${stories.length} stories`}
              status="done"
              sideMetrics={[
                { label: "Total Stories", value: String(stories.length) },
                {
                  label: "Acceptance Criteria",
                  value: String(
                    stories.reduce(
                      (acc, s: any) => acc + (s.acceptance_criteria?.length || 0),
                      0
                    )
                  ),
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[storyAgent.id]}
              onToggleExpand={() => toggleCard(storyAgent.id)}
              onInspectPayload={() =>
                openInspectModal("User Stories Payload", storyAgent.label, stories)
              }
              rawPayload={stories}
            >
              {stories.length > 0 ? (
                <StoryGeneratorPane
                  stories={stories.slice(0, 6).map((s: any) => ({
                    statement: s.title,
                    acceptanceCriteria: s.acceptance_criteria ?? [],
                  }))}
                />
              ) : (
                <EmptyPane>No stories generated yet.</EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 7. Task Generator */}
          {matchesFilter(taskAgent.id, taskAgent.stage, taskAgent.label, taskAgent.purpose) && (
            <AgentRunCard
              agent={taskAgent}
              runTitle={`${taskAgent.label} — ${initiative.name}`}
              runMeta={`${tasks.length} tasks`}
              status="done"
              sideMetrics={[
                { label: "Total Tasks", value: String(tasks.length) },
                {
                  label: "Total Hours",
                  value: `${tasks.reduce(
                    (acc, t: any) => acc + (t.estimated_hours || 0),
                    0
                  )}h`,
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[taskAgent.id]}
              onToggleExpand={() => toggleCard(taskAgent.id)}
              onInspectPayload={() =>
                openInspectModal("Engineering Tasks Decomposition", taskAgent.label, tasks)
              }
              rawPayload={tasks}
            >
              {tasks.length > 0 ? (
                <TaskGeneratorPane
                  tasks={tasks.slice(0, 8).map((t: any) => ({
                    title: t.title,
                    layer: (["backend", "frontend", "test"].includes(t.category)
                      ? t.category
                      : "backend") as "backend" | "frontend" | "test",
                    dependsOn: t.dependencies?.[0],
                    estimate: `${t.estimated_hours}h`,
                  }))}
                />
              ) : (
                <EmptyPane>No tasks generated yet.</EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 8. Sprint Planner */}
          {matchesFilter(sprintAgent.id, sprintAgent.stage, sprintAgent.label, sprintAgent.purpose) && (
            <AgentRunCard
              agent={sprintAgent}
              runTitle={`${sprintAgent.label} — ${
                latestSprint
                  ? latestSprint.name || `Sprint ${latestSprint.sprint_number}`
                  : initiative.name
              }`}
              runMeta={
                latestSprint ? `capacity ${latestSprint.capacity}` : "no sprint yet"
              }
              status={latestSprint?.status === "active" ? "running" : "done"}
              sideMetrics={[
                {
                  label: "Capacity",
                  value: `${latestSprint?.capacity || 0} pts`,
                },
                {
                  label: "Teams",
                  value: String(Object.keys(latestSprint?.team_load ?? {}).length),
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[sprintAgent.id]}
              onToggleExpand={() => toggleCard(sprintAgent.id)}
              onInspectPayload={() =>
                openInspectModal("Sprint Capacity Plan", sprintAgent.label, latestSprint)
              }
              rawPayload={latestSprint}
            >
              {latestSprint && Object.keys(latestSprint.team_load ?? {}).length > 0 ? (
                <SprintPlannerPane
                  rows={Object.entries(
                    latestSprint.team_load as Record<string, number>
                  ).map(([team, used]) => ({
                    team,
                    used,
                    capacity: latestSprint.capacity || used,
                  }))}
                />
              ) : (
                <EmptyPane>No sprint capacity data yet.</EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 9. Scrum Master */}
          {matchesFilter(scrumAgent.id, scrumAgent.stage, scrumAgent.label, scrumAgent.purpose) && (
            <AgentRunCard
              agent={scrumAgent}
              runTitle={`${scrumAgent.label} — ${
                latestSprint
                  ? latestSprint.name || `Sprint ${latestSprint.sprint_number}`
                  : initiative.name
              }`}
              runMeta={
                standup
                  ? `posted ${new Date(standup.date).toLocaleString()}`
                  : "no standup yet"
              }
              status="done"
              sideAction={
                latestSprint ? (
                  <button
                    type="button"
                    onClick={runStandup}
                    disabled={standupLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      size={12}
                      className={standupLoading ? "animate-spin" : ""}
                    />
                    <span>{standupLoading ? "Running…" : "Run Standup"}</span>
                  </button>
                ) : undefined
              }
              sideMetrics={[
                {
                  label: "Blockers",
                  value: String(standup?.blockers?.length || 0),
                },
                {
                  label: "Risks",
                  value: String(standup?.risks?.length || 0),
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[scrumAgent.id]}
              onToggleExpand={() => toggleCard(scrumAgent.id)}
              onInspectPayload={() =>
                openInspectModal("Daily Standup Telemetry", scrumAgent.label, standup)
              }
              rawPayload={standup}
            >
              {standup ? (
                <ScrumMasterPane
                  rollup={{
                    onTrack: tasks.filter(
                      (t: any) => t.status === "in_progress" || t.status === "done"
                    ).length,
                    blocked: standup.blockers?.length ?? 0,
                    atRisk: standup.risks?.length ?? 0,
                    blockerNote: standup.blockers?.[0],
                  }}
                />
              ) : (
                <EmptyPane>
                  {latestSprint
                    ? "No standup run yet for this sprint."
                    : "No sprint to run standup for."}
                </EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 10. Task Executor */}
          {matchesFilter(execAgent.id, execAgent.stage, execAgent.label, execAgent.purpose) && (
            <AgentRunCard
              agent={execAgent}
              runTitle={`${execAgent.label} — ${
                latestExecution ? latestExecution.agent : "no run yet"
              }`}
              runMeta={
                latestExecution
                  ? `task ${latestExecution.task_id.slice(0, 8)}`
                  : "no execution yet"
              }
              status={
                latestExecution
                  ? AGENT_EXEC_STATUS[latestExecution.status ?? "queued"] ?? "running"
                  : "done"
              }
              statusLabel={latestExecution?.current_thought || undefined}
              progressPct={latestExecution?.progress}
              sideMetrics={
                latestExecution
                  ? [
                      {
                        label: "Tokens",
                        value: String(latestExecution.tokens_used || 0),
                      },
                      {
                        label: "Cost",
                        value: `$${(latestExecution.cost_usd ?? 0).toFixed(2)}`,
                      },
                      {
                        label: "Duration",
                        value: `${(latestExecution.duration_seconds ?? 0).toFixed(0)}s`,
                      },
                    ]
                  : [
                      { label: "Tokens", value: "0" },
                      { label: "Cost", value: "$0.00" },
                    ]
              }
              modelName="Claude 3.7 Sonnet / Sandbox"
              isExpanded={expandedCards[execAgent.id]}
              onToggleExpand={() => toggleCard(execAgent.id)}
              onInspectPayload={() =>
                openInspectModal(
                  "Task Execution Trace & Logs",
                  execAgent.label,
                  latestExecution
                )
              }
              rawPayload={latestExecution}
            >
              {latestExecution ? (
                <TaskExecutorPane
                  lines={(latestExecution.logs ?? [])
                    .slice(-8)
                    .map((l: string, i: number) => ({
                      time: String(i).padStart(2, "0"),
                      text: l,
                      emphasis:
                        latestExecution.status === "failed"
                          ? ("error" as const)
                          : undefined,
                    }))}
                />
              ) : (
                <EmptyPane>
                  No task has been executed yet — run one from the board.
                </EmptyPane>
              )}
            </AgentRunCard>
          )}

          {/* 11. Integration */}
          {matchesFilter(integrationAgent.id, integrationAgent.stage, integrationAgent.label, integrationAgent.purpose) && (
            <AgentRunCard
              agent={integrationAgent}
              runTitle={`${integrationAgent.label} — ${initiative.name}`}
              runMeta={
                techStack.length > 0
                  ? `${techStack.length} systems`
                  : "no tech stack yet"
              }
              status="done"
              sideMetrics={[
                {
                  label: "Systems",
                  value: String(techStack.length),
                },
                {
                  label: "Sync Status",
                  value: techStack.length > 0 ? "Synced" : "Idle",
                },
              ]}
              modelName="Gemini 2.5 Flash"
              isExpanded={expandedCards[integrationAgent.id]}
              onToggleExpand={() => toggleCard(integrationAgent.id)}
              onInspectPayload={() =>
                openInspectModal(
                  "Integration Architecture Stack",
                  integrationAgent.label,
                  techStack
                )
              }
              rawPayload={techStack}
            >
              {techStack.length > 0 ? (
                <IntegrationPane
                  systems={techStack.map((tech) => ({ label: tech, ok: true }))}
                />
              ) : (
                <EmptyPane>
                  No tech stack defined for this initiative yet.
                </EmptyPane>
              )}
            </AgentRunCard>
          )}
        </div>
      )}

      {/* 4. Raw JSON Payload Modal */}
      <AgentPayloadModal
        isOpen={payloadModal.isOpen}
        onClose={() => setPayloadModal((prev) => ({ ...prev, isOpen: false }))}
        title={payloadModal.title}
        agentName={payloadModal.agentName}
        payload={payloadModal.payload}
      />
    </div>
  );
}
