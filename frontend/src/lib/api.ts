import axios from 'axios'

// Vite env typing fallback (prevents TS error in some toolchains)
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Projects
export const projectsApi = {
  list: () => api.get('/projects/').then(r => r.data),
  get: (id: string) => api.get(`/projects/${id}`).then(r => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post('/projects/', data).then(r => r.data),
  update: (id: string, data: any) =>
    api.put(`/projects/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then(r => r.data),
  getBuilds: (id: string) => api.get(`/projects/${id}/builds`).then(r => r.data),
}

// Builds
export const buildsApi = {
  create: (data: { project_id: string; prompt: string }) =>
    api.post('/builds/', data).then(r => r.data),
  get: (id: string) => api.get(`/builds/${id}`).then(r => r.data),
  getFiles: (id: string) => api.get(`/builds/${id}/files`).then(r => r.data),
  rollback: (id: string, version: number) =>
    api.post(`/builds/${id}/rollback/${version}`).then(r => r.data),
}

// Integrations
export const integrationsApi = {
  getPlaybooks: () => api.get('/integrations/playbooks').then(r => r.data),
}
