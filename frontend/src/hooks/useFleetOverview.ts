import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kernelApi, type KernelRun } from "../lib/kernelApi";
import { llmApi } from "../lib/api";
import { LIVE_MODE } from "../lib/env";
import { commandCenterApi } from "../lib/commandCenterApi";
import {
  applyCommandCenterSummary,
  buildDemoOverview,
  gatewayFromHealth,
  overviewFromKernelRuns,
  type ActivityEvent,
  type FleetGate,
  type FleetOverview,
  type GatewayHealthResponse,
} from "../lib/commandCenterData";
import { useProjectsQuery } from "./useActiveProject";

export const FLEET_OVERVIEW_QUERY_KEY = ["fleet-overview"] as const;

/** Upper bound on projects polled for runs, to keep the fan-out cheap. */
const MAX_PROJECTS = 8;

/**
 * Fleet-wide view of runs, approval gates, activity and gateway health for the
 * Command Center and the sidebar's Approvals count.
 */
export function useFleetOverview() {
  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } =
    useProjectsQuery();

  const projectKey = projects.slice(0, MAX_PROJECTS).map((p) => p.id);

  const query = useQuery<FleetOverview>({
    queryKey: [...FLEET_OVERVIEW_QUERY_KEY, LIVE_MODE ? projectKey : "demo"],
    enabled: !LIVE_MODE || !projectsLoading,
    staleTime: 15_000,
    refetchInterval: LIVE_MODE ? 30_000 : false,
    queryFn: async () => {
      if (!LIVE_MODE) return buildDemoOverview();

      const targets = projects.slice(0, MAX_PROJECTS);
      // The fleet summary (stat comparisons + activity across every accessible
      // project) is fetched alongside the per-project run lists.
      const summaryRequest = commandCenterApi.summary("24h").then(
        (summary) => summary,
        () => null,
      );
      const settled = await Promise.allSettled(
        targets.map((p) => kernelApi.listRuns(p.id, 10)),
      );
      // If every project failed, surface an error instead of an empty fleet.
      if (targets.length > 0 && settled.every((s) => s.status === "rejected")) {
        throw (settled[0] as PromiseRejectedResult).reason;
      }
      const runsByProject = targets.map((p, i) => {
        const s = settled[i];
        return {
          projectId: p.id,
          projectName: p.name,
          runs: s.status === "fulfilled" ? (s.value.runs ?? []) : ([] as KernelRun[]),
        };
      });

      let gateway = null;
      try {
        const health = (await llmApi.health()) as GatewayHealthResponse;
        gateway = gatewayFromHealth(
          health,
          runsByProject.flatMap((r) => r.runs),
        );
      } catch {
        // Admin-only endpoint; non-admins just don't see provider health.
        gateway = null;
      }

      const overview = overviewFromKernelRuns(runsByProject, gateway);
      // Without the summary the tiles fall back to values derived from the
      // fetched runs, with no deltas (null), rather than invented comparisons.
      const summary = await summaryRequest;
      const merged = summary ? applyCommandCenterSummary(overview, summary) : overview;
      return { ...merged, projectCount: projects.length };
    },
  });

  return {
    ...query,
    isError: query.isError || (LIVE_MODE && projectsError),
    isLoading: query.isLoading || (LIVE_MODE && projectsLoading),
  };
}

export type GateDecision = "approve" | "reject";

/** Approve or reject a kernel approval gate (local-only in demo mode). */
export function useGateDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gate, decision }: { gate: FleetGate; decision: GateDecision }) => {
      if (!LIVE_MODE) return { gate, decision };
      const call = decision === "approve" ? kernelApi.approveGate : kernelApi.rejectGate;
      await call(gate.projectId, gate.runId, gate.id, "Decided from Command Center");
      return { gate, decision };
    },
    onSuccess: ({ gate, decision }) => {
      if (LIVE_MODE) {
        queryClient.invalidateQueries({ queryKey: FLEET_OVERVIEW_QUERY_KEY });
        return;
      }
      queryClient.setQueriesData<FleetOverview>(
        { queryKey: FLEET_OVERVIEW_QUERY_KEY },
        (prev) => {
          if (!prev) return prev;
          const gates = prev.gates.filter((g) => g.id !== gate.id);
          const event: ActivityEvent = {
            id: `${gate.id}:${decision}`,
            at: new Date().toISOString(),
            kind: decision === "approve" ? "gate_approved" : "gate_rejected",
            actor: "You",
            text: `${decision === "approve" ? "approved" : "rejected"} ${gate.gateName.toLowerCase()}`,
            projectName: gate.projectName,
          };
          const stillWaiting = gates.some((g) => g.runId === gate.runId);
          return {
            ...prev,
            gates,
            runs: prev.runs.map((r) =>
              r.id === gate.runId && !stillWaiting
                ? { ...r, status: decision === "approve" ? ("running" as const) : ("failed" as const) }
                : r,
            ),
            activity: [event, ...prev.activity            ].slice(0, 8),
            stats: { ...prev.stats, pendingApprovals: gates.length },
          };
        },
      );
    },
  });
}
