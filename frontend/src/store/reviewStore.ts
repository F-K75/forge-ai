import { create } from 'zustand'
import type { AnyReviewWSEvent } from '../lib/reviewWsContract'

// Mirrors AgentPipeline's AgentState, but the orchestrator reports a hard
// "failed" outcome per agent (AgentStatus in orchestrator/models.py) rather
// than the build pipeline's "debugging" retry state.
export type ReviewAgentState = 'idle' | 'active' | 'done' | 'failed'

export type ReviewRunStatus = 'pending' | 'running' | 'consolidating' | 'complete' | 'failed'

export interface AgentResult {
  status: ReviewAgentState
  score?: number | null
  issues?: number
  costUsd?: number
  error?: string | null
}

export interface ReviewState {
  runId: string | null
  status: ReviewRunStatus
  mode: 'full' | 'diff' | null
  candidateFiles: number
  triggeredAgents: string[]
  agentStates: Record<string, AgentResult>

  overallScore: number | null
  recommendation: 'GO' | 'NO_GO' | 'GO_WITH_FIXES' | null
  backlogCount: number | null
  totalCostUsd: number
  totalTokens: number
  error: string | null

  // Seed state from a full REST-fetched ReviewRun (page load / reload).
  hydrateFromRun: (run: any) => void
  handleEvent: (event: AnyReviewWSEvent) => void
  reset: () => void
}

const initialState = {
  runId: null,
  status: 'pending' as ReviewRunStatus,
  mode: null,
  candidateFiles: 0,
  triggeredAgents: [],
  agentStates: {},
  overallScore: null,
  recommendation: null,
  backlogCount: null,
  totalCostUsd: 0,
  totalTokens: 0,
  error: null,
}

export const useReviewStore = create<ReviewState>((set, _get) => ({
  ...initialState,

  hydrateFromRun: (run: any) => {
    const triggeredAgents: string[] = run.triggered_agents || []
    const reportsByAgent = new Map((run.agent_reports || []).map((r: any) => [r.agent_id, r]))

    const agentStates: Record<string, AgentResult> = {}
    for (const agentId of triggeredAgents) {
      const report = reportsByAgent.get(agentId) as any
      if (report) {
        agentStates[agentId] = {
          status: report.status === 'failed' ? 'failed' : 'done',
          score: report.score,
          issues: report.issues?.length ?? 0,
          costUsd: report.cost_usd,
          error: report.error,
        }
      } else {
        agentStates[agentId] = { status: run.status === 'running' ? 'active' : 'idle' }
      }
    }

    set({
      runId: run.run_id,
      status: run.status,
      mode: run.mode,
      candidateFiles: run.candidate_files ?? 0,
      triggeredAgents,
      agentStates,
      overallScore: run.consolidated?.overall_score ?? null,
      recommendation: run.consolidated?.recommendation ?? null,
      totalCostUsd: run.total_cost_usd ?? 0,
      totalTokens: run.total_tokens ?? 0,
      error: run.error ?? null,
    })
  },

  handleEvent: (event: AnyReviewWSEvent) => {
    set(state => {
      switch (event.type) {
        case 'run_started':
          return {
            status: 'running',
            mode: event.mode,
            candidateFiles: event.candidate_files,
            triggeredAgents: event.triggered_agents,
            agentStates: Object.fromEntries(
              event.triggered_agents.map(id => [id, { status: 'idle' as ReviewAgentState }])
            ),
          }

        case 'agent_started':
          return {
            agentStates: {
              ...state.agentStates,
              [event.agent_id]: { status: 'active' },
            },
          }

        case 'agent_done':
          return {
            agentStates: {
              ...state.agentStates,
              [event.agent_id]: {
                status: event.status === 'failed' ? 'failed' : 'done',
                score: event.score,
                issues: event.issues,
                costUsd: event.cost_usd,
                error: event.error,
              },
            },
          }

        case 'consolidating':
          return { status: 'consolidating' }

        case 'complete':
          return {
            status: 'complete',
            overallScore: event.overall_score,
            recommendation: event.recommendation,
            backlogCount: event.backlog_items,
            totalCostUsd: event.total_cost_usd,
            totalTokens: event.total_tokens,
          }

        case 'error':
          return { status: 'failed', error: event.error ?? 'Review failed' }

        default:
          return state
      }
    })
  },

  reset: () => set(initialState),
}))
