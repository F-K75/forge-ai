import { api } from "./api";

/** Why a comparison value is null (see backend/core/command_center.py). */
export type ComparisonUnavailableReason = "not_compared" | "no_baseline" | "history_truncated";

export interface CountComparison {
  current: number;
  /** null when the comparison can't be computed honestly. */
  previous: number | null;
  delta: number | null;
  compared_to: "same_time_yesterday" | "1h_ago" | "prior_24h" | null;
  unavailable_reason: ComparisonUnavailableReason | null;
}

export interface SpendComparison {
  current_usd: number;
  previous_usd: number;
  /** null when there was no spend over the same period yesterday. */
  delta_pct: number | null;
  compared_to: "yesterday_same_time";
  unavailable_reason: ComparisonUnavailableReason | null;
  /** Sum of configured daily project limits; null when none are set. */
  daily_budget_usd: number | null;
  /** Sum of the per-run budget caps of the runs active now. */
  active_run_caps_usd: number;
}

export type SummaryActivityKind =
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "run_cancelled"
  | "gate_opened"
  | "gate_approved"
  | "gate_rejected"
  | "deploy_started"
  | "deploy_live"
  | "deploy_failed";

export interface SummaryActivityEvent {
  id: string;
  kind: SummaryActivityKind;
  at: string;
  project_id: string;
  project_name: string;
  run_id: string | null;
  deployment_id?: string | null;
  /** Run objective (short), gate name, or deployment URL/target. */
  title: string;
  /** Who decided a gate; null for system events. */
  actor: string | null;
}

export interface CommandCenterSummary {
  window: "24h";
  generated_at: string;
  scope: {
    project_count: number;
    projects_truncated: boolean;
    max_projects: number;
    history_truncated: boolean;
  };
  stats: {
    active_runs: CountComparison;
    agents_working: CountComparison;
    pending_approvals: CountComparison;
    spend_today: SpendComparison;
    skills_invoked: CountComparison;
  };
  activity: SummaryActivityEvent[];
}

export const commandCenterApi = {
  summary: async (window: "24h" = "24h"): Promise<CommandCenterSummary> => {
    const { data } = await api.get<CommandCenterSummary>("/v1/command-center/summary", {
      params: { window },
    });
    return data;
  },
};
