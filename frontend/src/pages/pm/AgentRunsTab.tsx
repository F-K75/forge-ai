import { useEffect, useState } from "react";
import { AgentRunShell } from "../../components/agentRun/AgentRunShell";
import { gatewayAgentById } from "../../lib/gatewayAgents";
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
import { usePMStore } from "../../store/pmStore";
import { sprintsApi } from "../../lib/pmApi";
import toast from "react-hot-toast";
import { Bot } from "lucide-react";
import { motion, motionVariants } from "../../lib/animations";

const PRIORITY_LABEL: Record<string, "P0" | "P1" | "P2"> = { p0: "P0", p1: "P1", p2: "P2", p3: "P2" };
const AGENT_EXEC_STATUS: Record<string, "running" | "needs_review" | "done"> = {
  queued: "needs_review",
  running: "running",
  completed: "done",
  failed: "needs_review",
};

function EmptyPane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div className="rounded-2xl border border-inlay bg-inlay-subtle p-6 text-center backdrop-blur-xl" variants={motionVariants.fadeIn}>
      <p className="text-sm text-faint">{children}</p>
    </motion.div>
  );
}

// Renders the shared AgentRunShell + panes (components/agentRun/) against
// real initiative data already hydrated into usePMStore by InitiativeLayout.
export default function AgentRunsTab() {
  const { initiative, prd, epics, stories, tasks, sprints, executions, decisionFeed, loading } =
    usePMStore();
  const [standup, setStandup] = useState<Record<string, any> | null>(null);
  const [standupLoading, setStandupLoading] = useState(false);

  const latestSprint = sprints[0];

  useEffect(() => {
    if (!latestSprint) return;
    sprintsApi
      .standups(latestSprint.id)
      .then((rows: any[]) => setStandup(rows?.[0] ?? null))
      .catch(() => setStandup(null));
  }, [latestSprint]);

  const runStandup = async () => {
    if (!latestSprint) return;
    setStandupLoading(true);
    try {
      const s = await sprintsApi.standup(latestSprint.id);
      setStandup(s);
      toast.success("Standup posted");
    } catch {
      toast.error("Couldn't run the standup.");
    } finally {
      setStandupLoading(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 text-center text-sm text-faint">Loading agent runs…</div>;
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

  return (
    <motion.div className="mx-auto max-w-5xl px-4 py-6 md:px-8 flex flex-col gap-8" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
      {/* Section: Agent pipeline runs */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Bot size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Agent Pipeline</h2>
      </div>
      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={ba}
          runId={initiative.id}
          runTitle={`${ba.label} — ${initiative.name}`}
          runMeta={`initiative_${initiative.id.slice(0, 8)}`}
          status={initiative.status === "generating" ? "running" : "done"}
          sideMetrics={[{ label: "Status", value: initiative.status }]}
        >
          {initiative.vision ? (
            <BusinessAnalystPane
              problem={initiative.vision}
              users={(prd?.personas ?? []).map((p: any) => p.name ?? p.role ?? "User")}
              assumptions={(initiative.risks ?? []).map((r: any) => ({
                text: r.description ?? String(r),
                flagged: true,
              }))}
            />
          ) : (
            <EmptyPane>No brief generated yet.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={dec}
          runId="live"
          runTitle={`${dec.label} — live decisions`}
          runMeta="streams via decision_made WS events"
          status={latestDecision ? "done" : "running"}
          statusLabel={latestDecision ? "Latest decision" : "Waiting for a task to complete"}
          sideMetrics={[{ label: "Feed size", value: String(decisionFeed.length) }]}
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
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={prdAgent}
          runId={prd?.id ?? "—"}
          runTitle={`${prdAgent.label} — ${initiative.name}`}
          runMeta={prd ? `prd v${prd.version}` : "no prd yet"}
          status={prd ? "done" : "running"}
        >
          {prd ? (
            <PrdWriterPane
              sections={["Executive summary", "Problem", "Solution", "Functional requirements", "Release plan"]}
              activeSectionIndex={2}
              activeHeading="Solution"
              activeBody={prd.solution || prd.problem_statement || "—"}
            />
          ) : (
            <EmptyPane>PRD hasn't been generated yet.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={epicAgent}
          runId={initiative.id}
          runTitle={`${epicAgent.label} — ${initiative.name}`}
          runMeta={`${epics.length} epics`}
          status="done"
        >
          {epics.length > 0 ? (
            <EpicGeneratorPane
              epics={epics.map((e: any) => ({
                title: e.title,
                area: e.estimated_duration || "—",
                storyCount: `${stories.filter((s: any) => s.epic_id === e.id).length} stories`,
                priority: PRIORITY_LABEL[e.priority] ?? "P2",
              }))}
            />
          ) : (
            <EmptyPane>No epics generated yet.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={storyAgent}
          runId={initiative.id}
          runTitle={`${storyAgent.label} — ${initiative.name}`}
          runMeta={`${stories.length} stories`}
          status="done"
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
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={taskAgent}
          runId={initiative.id}
          runTitle={`${taskAgent.label} — ${initiative.name}`}
          runMeta={`${tasks.length} tasks`}
          status="done"
        >
          {tasks.length > 0 ? (
            <TaskGeneratorPane
              tasks={tasks.slice(0, 8).map((t: any) => ({
                title: t.title,
                layer: (["backend", "frontend", "test"].includes(t.category) ? t.category : "backend") as
                  | "backend"
                  | "frontend"
                  | "test",
                dependsOn: t.dependencies?.[0],
                estimate: `${t.estimated_hours}h`,
              }))}
            />
          ) : (
            <EmptyPane>No tasks generated yet.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={sprintAgent}
          runId={latestSprint?.id ?? "—"}
          runTitle={`${sprintAgent.label} — ${latestSprint ? latestSprint.name || `Sprint ${latestSprint.sprint_number}` : initiative.name}`}
          runMeta={latestSprint ? `capacity ${latestSprint.capacity}` : "no sprint yet"}
          status={latestSprint?.status === "active" ? "running" : "done"}
        >
          {latestSprint && Object.keys(latestSprint.team_load ?? {}).length > 0 ? (
            <SprintPlannerPane
              rows={Object.entries(latestSprint.team_load as Record<string, number>).map(([team, used]) => ({
                team,
                used,
                capacity: latestSprint.capacity || used,
              }))}
            />
          ) : (
            <EmptyPane>No sprint capacity data yet.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={scrumAgent}
          runId={latestSprint?.id ?? "—"}
          runTitle={`${scrumAgent.label} — ${latestSprint ? latestSprint.name || `Sprint ${latestSprint.sprint_number}` : initiative.name}`}
          runMeta={standup ? `posted ${new Date(standup.date).toLocaleString()}` : "no standup yet"}
          status="done"
          sideExtra={
            latestSprint
              ? {
                  label: "Actions",
                  content: (
                    <button
                      type="button"
                      onClick={runStandup}
                      disabled={standupLoading}
                      className="flex items-center justify-center h-9 w-full rounded-xl border border-inlay bg-inlay-subtle text-sm font-medium text-ink hover:bg-inlay-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 backdrop-blur-xl transition-colors motion-reduce:transition-none disabled:opacity-50"
                    >
                      {standupLoading ? "Running…" : "Run standup"}
                    </button>
                  ),
                }
              : undefined
          }
        >
          {standup ? (
            <ScrumMasterPane
              rollup={{
                onTrack: tasks.filter((t: any) => t.status === "in_progress" || t.status === "done").length,
                blocked: standup.blockers?.length ?? 0,
                atRisk: standup.risks?.length ?? 0,
                blockerNote: standup.blockers?.[0],
              }}
            />
          ) : (
            <EmptyPane>
              {latestSprint ? "No standup run yet for this sprint." : "No sprint to run standup for."}
            </EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={execAgent}
          runId={latestExecution?.id ?? "—"}
          runTitle={`${execAgent.label} — ${latestExecution ? latestExecution.agent : "no run yet"}`}
          runMeta={latestExecution ? `task ${latestExecution.task_id.slice(0, 8)}` : "no execution yet"}
          status={latestExecution ? AGENT_EXEC_STATUS[latestExecution.status ?? "queued"] ?? "running" : "done"}
          statusLabel={latestExecution?.current_thought || undefined}
          progressPct={latestExecution?.progress}
          sideMetrics={
            latestExecution
              ? [
                  { label: "Tokens", value: String(latestExecution.tokens_used) },
                  { label: "Cost", value: `$${(latestExecution.cost_usd ?? 0).toFixed(2)}` },
                  { label: "Duration", value: `${(latestExecution.duration_seconds ?? 0).toFixed(0)}s` },
                ]
              : []
          }
        >
          {latestExecution ? (
            <TaskExecutorPane
              lines={(latestExecution.logs ?? []).slice(-8).map((l: string, i: number) => ({
                time: String(i).padStart(2, "0"),
                text: l,
                emphasis: latestExecution.status === "failed" ? ("error" as const) : undefined,
              }))}
            />
          ) : (
            <EmptyPane>No task has been executed yet — run one from the board.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={designerAgent}
          runId={initiative.id}
          runTitle={`${designerAgent.label} — ${initiative.name}`}
          runMeta={Object.keys(initiative.design || {}).length > 0 ? "design ready" : "no design yet"}
          status={Object.keys(initiative.design || {}).length > 0 ? "done" : "running"}
        >
          <DesignPane design={initiative.design || {}} />
        </AgentRunShell>
      </motion.div>

      <motion.div variants={motionVariants.staggerItem}>
        <AgentRunShell
          agent={integrationAgent}
          runId={initiative.id}
          runTitle={`${integrationAgent.label} — ${initiative.name}`}
          runMeta={techStack.length > 0 ? `${techStack.length} systems` : "no tech stack yet"}
          status="done"
        >
          {techStack.length > 0 ? (
            <IntegrationPane systems={techStack.map((tech) => ({ label: tech, ok: true }))} />
          ) : (
            <EmptyPane>No tech stack defined for this initiative yet.</EmptyPane>
          )}
        </AgentRunShell>
      </motion.div>
    </motion.div>
  );
}
