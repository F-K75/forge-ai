import axios from 'axios'

// The Review Board orchestrator is a separate FastAPI service (its own
// process/port, no shared auth with the main backend) — see orchestrator/main.py.
const ORCHESTRATOR_URL = (import.meta as any).env?.VITE_ORCHESTRATOR_URL || 'http://localhost:8100'

export const orchestratorApi = axios.create({
  baseURL: ORCHESTRATOR_URL,
  headers: { 'Content-Type': 'application/json' },
})

export interface CreateReviewPayload {
  repo_path: string
  mode: 'full' | 'diff'
  diff?: string
  repo_ref?: string
}

export const reviewsApi = {
  list: (limit = 50) => orchestratorApi.get('/reviews', { params: { limit } }).then(r => r.data),
  get: (runId: string) => orchestratorApi.get(`/reviews/${runId}`).then(r => r.data),
  create: (payload: CreateReviewPayload) => orchestratorApi.post('/reviews', payload).then(r => r.data),
  backlog: (runId: string, sortBy: 'severity' | 'impact' = 'severity') =>
    orchestratorApi.get(`/reviews/${runId}/backlog`, { params: { sort_by: sortBy } }).then(r => r.data),
}

export function reviewSocketUrl(runId: string): string {
  return `${ORCHESTRATOR_URL.replace(/^http/, 'ws')}/reviews/${runId}/stream`
}
