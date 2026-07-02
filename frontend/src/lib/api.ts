import axios from 'axios'

// Vite env typing fallback (prevents TS error in some toolchains)
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Auth
export const authApi = {
  register: (data: { email: string; name: string; password: string }) =>
    api.post('/auth/register', data).then(r => r.data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then(r => r.data),
  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  updateProfile: (data: { name?: string; avatar_url?: string }) =>
    api.put('/auth/me', data).then(r => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/me/password', data).then(r => r.data),
  organizations: {
    create: (data: { name: string; slug?: string }) => api.post('/auth/organizations', data).then(r => r.data),
    list: () => api.get('/auth/organizations').then(r => r.data),
    get: (id: string) => api.get(`/auth/organizations/${id}`).then(r => r.data),
    invite: (id: string, data: { email: string; role?: string }) => api.post(`/auth/organizations/${id}/invite`, data).then(r => r.data),
    members: (id: string) => api.get(`/auth/organizations/${id}/members`).then(r => r.data),
    acceptInvite: (token: string) => api.post(`/auth/organizations/invitations/${token}/accept`).then(r => r.data),
  },
}

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

// Billing
export const billingApi = {
  checkout: (data: { plan: string; success_url: string; cancel_url: string }) =>
    api.post('/billing/checkout', data).then(r => r.data),
  subscription: () => api.get('/billing/subscription').then(r => r.data),
  invoices: () => api.get('/billing/invoices').then(r => r.data),
  usage: () => api.get('/billing/usage').then(r => r.data),
  plans: () => api.get('/billing/plans').then(r => r.data),
  cancel: (at_period_end: boolean) => api.post('/billing/cancel', { at_period_end }).then(r => r.data),
  reactivate: () => api.post('/billing/reactivate').then(r => r.data),
  purchaseCredits: (package_id: string) => api.post('/billing/credits/purchase', { package_id }).then(r => r.data),
  portal: (return_url: string) => api.post('/billing/portal', { return_url }).then(r => r.data),
}

// Analytics
export const analyticsApi = {
  track: (event_name: string, project_id?: string, properties?: any) =>
    api.post('/analytics/event', { event_name, project_id, properties }).then(r => r.data),
  funnel: (days?: number) => api.get('/analytics/funnel', { params: { days } }).then(r => r.data),
  retention: (days?: number) => api.get('/analytics/retention', { params: { days } }).then(r => r.data),
  buildSuccess: (days?: number) => api.get('/analytics/builds/success-rate', { params: { days } }).then(r => r.data),
  personal: (days?: number) => api.get('/analytics/me', { params: { days } }).then(r => r.data),
}

// Deployments
export const deploymentsApi = {
  create: (data: { build_id: string; project_id: string }) =>
    api.post('/deployments/', data).then(r => r.data),
  list: (project_id?: string) => api.get('/deployments/', { params: { project_id } }).then(r => r.data),
  get: (id: string) => api.get(`/deployments/${id}`).then(r => r.data),
  cancel: (id: string) => api.delete(`/deployments/${id}`).then(r => r.data),
  logs: (id: string) => api.get(`/deployments/${id}/logs`).then(r => r.data),
  pushToGitHub: (data: { project_id: string; build_id: string; repo_url: string; github_token: string }) =>
    api.post('/deployments/github/push', data).then(r => r.data),
}

// Integrations
export const integrationsApi = {
  getPlaybooks: () => api.get('/integrations/playbooks').then(r => r.data),
}

// API Keys
export const apiKeysApi = {
  list: () => api.get('/api-keys/').then(r => r.data),
  create: (data: { name: string; scopes?: string[] }) => api.post('/api-keys/', data).then(r => r.data),
  delete: (id: string) => api.delete(`/api-keys/${id}`).then(r => r.data),
}

// Webhooks
export const webhooksApi = {
  list: () => api.get('/webhooks/').then(r => r.data),
  create: (data: { url: string; events?: string[] }) => api.post('/webhooks/', data).then(r => r.data),
  delete: (id: string) => api.delete(`/webhooks/${id}`).then(r => r.data),
}

// Admin
export const adminApi = {
  overview: () => api.get('/admin/analytics/overview').then(r => r.data),
  systemHealth: () => api.get('/admin/system/health').then(r => r.data),
  listUsers: (search?: string) => api.get('/admin/users', { params: { search } }).then(r => r.data),
  listBuilds: () => api.get('/admin/builds', { params: { per_page: 20 } }).then(r => r.data),
  adjustCredits: (data: { user_id: string; amount: number; reason: string }) =>
    api.post('/admin/billing/adjust', data).then(r => r.data),
}
