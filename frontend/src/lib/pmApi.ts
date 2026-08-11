import { api } from './api'

// Initiatives (Module 1)
export const initiativesApi = {
  list: () => api.get('/v1/initiatives/').then(r => r.data.initiatives),
  get: (id: string) => api.get(`/v1/initiatives/${id}`).then(r => r.data),
  create: (data: { prompt: string; name?: string }) =>
    api.post('/v1/initiatives/', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/v1/initiatives/${id}`, data).then(r => r.data),
  regenerate: (id: string) => api.post(`/v1/initiatives/${id}/regenerate`).then(r => r.data),
  getPrd: (id: string, format?: 'markdown') =>
    api.get(`/v1/initiatives/${id}/prd`, { params: format ? { format } : undefined }).then(r => r.data),
  updatePrd: (id: string, data: Record<string, unknown>) =>
    api.put(`/v1/initiatives/${id}/prd`, data).then(r => r.data),
  graph: (id: string) => api.get(`/v1/initiatives/${id}/graph`).then(r => r.data) as Promise<{
    nodes: { id: string; type: string; label: string; data?: any }[]
    edges: { source: string; target: string; kind?: string }[]
  }>,
  wsUrl: (id: string, base: string) => `${base}/v1/initiatives/ws/${id}`,
}

// Epics (Module 3)
export const epicsApi = {
  list: (initiative_id: string) => api.get('/epics/', { params: { initiative_id } }).then(r => r.data.epics),
  get: (id: string) => api.get(`/epics/${id}`).then(r => r.data),
  create: (data: { initiative_id: string; title: string; description?: string; priority?: string }) =>
    api.post('/epics/', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/epics/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/epics/${id}`).then(r => r.data),
}

// Stories (Module 4)
export const storiesApi = {
  list: (params: { initiative_id?: string; epic_id?: string }) =>
    api.get('/stories/', { params }).then(r => r.data.stories),
  get: (id: string) => api.get(`/stories/${id}`).then(r => r.data),
  create: (data: { epic_id: string; initiative_id: string; title: string; description?: string; priority?: string }) =>
    api.post('/stories/', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/stories/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/stories/${id}`).then(r => r.data),
}

// Tasks / Kanban (Modules 5, 8, 9, 13)
export const tasksApi = {
  list: (params: { initiative_id: string; sprint_id?: string; status?: string; assigned_agent?: string; label?: string; search?: string }) =>
    api.get('/tasks/', { params }).then(r => r.data.tasks),
  get: (id: string) => api.get(`/tasks/${id}`).then(r => r.data),
  create: (data: { story_id: string; epic_id: string; initiative_id: string; title: string; description?: string; category?: string; assigned_agent?: string }) =>
    api.post('/tasks/', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/tasks/${id}`, data).then(r => r.data),
  updateStatus: (id: string, status: string, kanban_order?: number) =>
    api.patch(`/tasks/${id}/status`, { status, kanban_order }).then(r => r.data),
  delete: (id: string) => api.delete(`/tasks/${id}`).then(r => r.data),
  execute: (id: string) => api.post(`/tasks/${id}/execute`).then(r => r.data),
  linkGithub: (id: string, data: { branch?: string; pr_number?: number; pr_url?: string; review_status?: string; merge_status?: string }) =>
    api.post(`/tasks/${id}/github-link`, data).then(r => r.data),
}

// Sprints + Scrum ceremonies (Modules 6, 7)
export const sprintsApi = {
  list: (initiative_id: string) => api.get('/sprints/', { params: { initiative_id } }).then(r => r.data.sprints),
  get: (id: string) => api.get(`/sprints/${id}`).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/sprints/${id}`, data).then(r => r.data),
  standup: (id: string) => api.post(`/sprints/${id}/standup`).then(r => r.data),
  standups: (id: string) => api.get(`/sprints/${id}/standups`).then(r => r.data.standups),
  review: (id: string) => api.post(`/sprints/${id}/review`).then(r => r.data),
  retro: (id: string) => api.post(`/sprints/${id}/retro`).then(r => r.data),
  riskReport: (id: string) => api.post(`/sprints/${id}/risk-report`).then(r => r.data),
  techDebt: (id: string) => api.post(`/sprints/${id}/tech-debt`).then(r => r.data),
  reports: (id: string) => api.get(`/sprints/${id}/reports`).then(r => r.data) as Promise<{
    reviews: any[]; retros: any[]; risk_reports: any[]; tech_debt: any[]
  }>,
}

// Releases (Module 12)
export const releasesApi = {
  list: (initiative_id: string) => api.get('/releases/', { params: { initiative_id } }).then(r => r.data.releases),
  get: (id: string) => api.get(`/releases/${id}`).then(r => r.data),
  generate: (initiative_id: string, version: string) =>
    api.post('/releases/generate', { initiative_id, version }).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/releases/${id}`, data).then(r => r.data),
}

// Agent executions / live dashboard (Modules 9, 10)
export const agentExecutionsApi = {
  list: (initiative_id: string, task_id?: string) =>
    api.get('/agent-executions/', { params: { initiative_id, task_id } }).then(r => r.data.executions),
  get: (id: string) => api.get(`/agent-executions/${id}`).then(r => r.data),
}
