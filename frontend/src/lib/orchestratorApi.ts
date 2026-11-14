import axios from 'axios'

// The Review Board orchestrator is an optional standalone FastAPI service.
// When VITE_ORCHESTRATOR_URL is unset, live mode degrades gracefully rather than
// hitting a nonexistent service on localhost:8100.
const rawUrl = (import.meta as any).env?.VITE_ORCHESTRATOR_URL
export const isOrchestratorConfigured = Boolean(rawUrl && String(rawUrl).trim().length > 0)
export const ORCHESTRATOR_URL: string | null = isOrchestratorConfigured ? String(rawUrl).trim() : null

export const orchestratorApi = axios.create({
  baseURL: ORCHESTRATOR_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: fail fast without making any network request when unconfigured
orchestratorApi.interceptors.request.use((config) => {
  if (!isOrchestratorConfigured || !ORCHESTRATOR_URL) {
    return Promise.reject(new Error('Review Board orchestrator service is not configured (missing VITE_ORCHESTRATOR_URL)'))
  }
  return config
})

export interface CreateReviewPayload {
  repo_path: string
  mode: 'full' | 'diff'
  diff?: string
  repo_ref?: string
}

export const reviewsApi = {
  isConfigured: () => isOrchestratorConfigured,
  list: (limit = 50) => {
    if (!isOrchestratorConfigured) {
      return Promise.reject(new Error('Review Board orchestrator service is not configured (missing VITE_ORCHESTRATOR_URL)'))
    }
    return orchestratorApi.get('/reviews', { params: { limit } }).then(r => r.data)
  },
  get: (runId: string) => {
    if (!isOrchestratorConfigured) {
      return Promise.reject(new Error('Review Board orchestrator service is not configured (missing VITE_ORCHESTRATOR_URL)'))
    }
    return orchestratorApi.get(`/reviews/${runId}`).then(r => r.data)
  },
  create: (payload: CreateReviewPayload) => {
    if (!isOrchestratorConfigured) {
      return Promise.reject(new Error('Review Board orchestrator service is not configured (missing VITE_ORCHESTRATOR_URL)'))
    }
    return orchestratorApi.post('/reviews', payload).then(r => r.data)
  },
  backlog: (runId: string, sortBy: 'severity' | 'impact' = 'severity') => {
    if (!isOrchestratorConfigured) {
      return Promise.reject(new Error('Review Board orchestrator service is not configured (missing VITE_ORCHESTRATOR_URL)'))
    }
    return orchestratorApi.get(`/reviews/${runId}/backlog`, { params: { sort_by: sortBy } }).then(r => r.data)
  },
}

export function reviewSocketUrl(runId: string): string | null {
  if (!isOrchestratorConfigured || !ORCHESTRATOR_URL) return null
  return `${ORCHESTRATOR_URL.replace(/^http/, 'ws')}/reviews/${runId}/stream`
}
