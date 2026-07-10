import axios from 'axios'

// Vite env typing fallback (prevents TS error in some toolchains)
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// The backend requires an X-CSRF-Token header on every state-changing
// request (see backend/core/security.py's csrf_protection_middleware).
// These paths are excluded server-side (no session yet, or have their own
// signature verification) so there's no token to fetch for them.
const CSRF_EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password', '/billing/webhook']

let csrfTokenPromise: Promise<string> | null = null
function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = api
      .get('/auth/csrf-token')
      .then(r => r.data.csrf_token)
      .catch(err => {
        csrfTokenPromise = null
        throw err
      })
  }
  return csrfTokenPromise
}

api.interceptors.request.use(async config => {
  const method = (config.method || 'get').toLowerCase()
  const isMutating = method !== 'get' && method !== 'head' && method !== 'options'
  const exempt = CSRF_EXEMPT_PATHS.some(p => config.url?.includes(p))
  if (isMutating && !exempt) {
    try {
      const token = await getCsrfToken()
      config.headers = config.headers ?? {}
      config.headers['X-CSRF-Token'] = token
    } catch {
      // Proceed without the header — the backend will 403 with a clear
      // "CSRF token required" error rather than silently failing.
    }
  }
  return config
})

// A stale/expired CSRF token means the next mutating request should fetch a
// fresh one rather than keep reusing the rejected one.
api.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      csrfTokenPromise = null
    }
    return Promise.reject(err)
  }
)

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
  updateProfile: (data: {
    name?: string
    avatar_url?: string
    github_token?: string
    llm_provider?: 'anthropic' | 'openai_compatible'
    llm_api_key?: string
    llm_base_url?: string
    llm_model?: string
    preferences?: Record<string, unknown>
  }) => api.put('/auth/me', data).then(r => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/me/password', data).then(r => r.data),
  organizations: {
    create: (data: { name: string; slug?: string }) => api.post('/auth/organizations', data).then(r => r.data),
    list: () => api.get('/auth/organizations').then(r => r.data.organizations),
    get: (id: string) => api.get(`/auth/organizations/${id}`).then(r => r.data),
    invite: (id: string, data: { email: string; role?: string }) => api.post(`/auth/organizations/${id}/invite`, data).then(r => r.data),
    members: (id: string) => api.get(`/auth/organizations/${id}/members`).then(r => r.data.members),
    acceptInvite: (token: string) => api.post(`/auth/organizations/invitations/${token}/accept`).then(r => r.data),
  },
  sessions: {
    list: () => api.get('/auth/sessions').then(r => r.data),
    revoke: (id: string) => api.delete(`/auth/sessions/${id}`).then(r => r.data),
    revokeAll: () => api.delete('/auth/sessions').then(r => r.data),
  },
  mfa: {
    setup: () => api.post('/auth/mfa/setup').then(r => r.data) as Promise<{ secret: string; otpauth_uri: string }>,
    verifySetup: (code: string) =>
      api.post('/auth/mfa/verify-setup', { code }).then(r => r.data) as Promise<{ ok: boolean; backup_codes: string[] }>,
    disable: (password: string) => api.post('/auth/mfa/disable', { password }).then(r => r.data),
    verify: (mfa_token: string, code: string) =>
      api.post('/auth/mfa/verify', { mfa_token, code }).then(r => r.data),
  },
}

// Projects
export const projectsApi = {
  list: () => api.get('/projects/').then(r => r.data.projects),
  get: (id: string) => api.get(`/projects/${id}`).then(r => r.data),
  create: (data: { name: string; description?: string; template?: string }) =>
    api.post('/projects/', data).then(r => r.data),
  update: (id: string, data: any) =>
    api.put(`/projects/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then(r => r.data),
  getBuilds: (id: string) => api.get(`/projects/${id}/builds`).then(r => r.data.builds),
}

// Builds
export const buildsApi = {
  create: (data: { project_id: string; prompt: string; interactive?: boolean }) =>
    api.post('/builds/', data).then(r => r.data),
  get: (id: string) => api.get(`/builds/${id}`).then(r => r.data),
  getFiles: (id: string) => api.get(`/builds/${id}/files`).then(r => r.data),
  rollback: (id: string, version: number) =>
    api.post(`/builds/${id}/rollback/${version}`).then(r => r.data),
  respondGate: (id: string, data: { gate_id: string; action: 'approve' | 'cancel' | 'answers'; answers?: string[] }) =>
    api.post(`/builds/${id}/gate`, data).then(r => r.data),
}

// Billing
export const billingApi = {
  checkout: (data: { plan: string; success_url: string; cancel_url: string; interval?: "monthly" | "annual" }) =>
    api.post('/billing/checkout', data).then(r => r.data),
  subscription: () => api.get('/billing/subscription').then(r => r.data),
  invoices: () => api.get('/billing/invoices').then(r => r.data.invoices),
  usage: () => api.get('/billing/usage').then(r => r.data),
  plans: () => api.get('/billing/plans').then(r => r.data),
  cancel: (at_period_end: boolean) => api.post('/billing/cancel', { at_period_end }).then(r => r.data),
  reactivate: () => api.post('/billing/reactivate').then(r => r.data),
  downgrade: (plan: string) => api.post('/billing/downgrade', { plan }).then(r => r.data),
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
  list: () => api.get('/api-keys/').then(r => r.data.api_keys),
  create: (data: { name: string; scopes?: string[] }) => api.post('/api-keys/', data).then(r => r.data),
  delete: (id: string) => api.delete(`/api-keys/${id}`).then(r => r.data),
}

// Webhooks
export const webhooksApi = {
  list: () => api.get('/webhooks/').then(r => r.data.webhooks),
  create: (data: { url: string; events?: string[] }) => api.post('/webhooks/', data).then(r => r.data),
  delete: (id: string) => api.delete(`/webhooks/${id}`).then(r => r.data),
}

// Notifications (Module 15 of the Agile PM layer reuses this existing collection)
export const notificationsApi = {
  list: (page?: number) => api.get('/growth/notifications', { params: { page } }).then(r => r.data.notifications) as Promise<
    { id: string; title: string; message: string; type: string; created_at: string; read_at?: string | null }[]
  >,
  markRead: (id: string) => api.post(`/growth/notifications/${id}/read`).then(r => r.data),
}

// Support
export const supportApi = {
  create: (data: { subject: string; description: string; priority?: string }) =>
    api.post('/support/tickets', data).then(r => r.data),
  list: (page?: number) => api.get('/support/tickets', { params: { page } }).then(r => r.data.tickets),
}

// Marketplace
export const marketplaceApi = {
  list: (params?: { type?: string; search?: string; page?: number; per_page?: number }) =>
    api.get('/marketplace/', { params }).then(r => r.data.items),
  get: (id: string) => api.get(`/marketplace/${id}`).then(r => r.data),
  download: (id: string) => api.post(`/marketplace/${id}/download`).then(r => r.data),
  rate: (id: string, rating: number) =>
    api.post(`/marketplace/${id}/rate`, null, { params: { rating } }).then(r => r.data),
  create: (data: { type?: string; title: string; description: string; prompt: string; tags?: string[]; is_public?: boolean }) =>
    api.post('/marketplace/', data).then(r => r.data),
}

// LLM routing (admin-only — see backend/api/llm.py's admin_required gate)
export const llmApi = {
  providers: () => api.get('/api/llm/providers').then(r => r.data),
  models: () => api.get('/api/llm/models').then(r => r.data),
  usage: (days?: number, limit?: number) => api.get('/api/llm/usage', { params: { days, limit } }).then(r => r.data),
  health: () => api.get('/api/llm/health').then(r => r.data),
  test: (data: { agent?: string; messages: { role: string; content: string }[]; provider_names?: string[]; model?: string }) =>
    api.post('/api/llm/test', data).then(r => r.data),
  setAgentOverride: (agent: string, data: { provider?: string; model?: string }) =>
    api.put(`/api/llm/agent/${agent}`, data).then(r => r.data),
  reload: () => api.post('/api/llm/reload').then(r => r.data),
}

// Admin
export const adminApi = {
  overview: () => api.get('/admin/analytics/overview').then(r => r.data),
  revenue: (days?: number) => api.get('/admin/analytics/revenue', { params: { days } }).then(r => r.data),
  aiUsage: (days?: number) => api.get('/admin/analytics/ai-usage', { params: { days } }).then(r => r.data),
  systemHealth: () => api.get('/admin/system/health').then(r => r.data),
  listUsers: (search?: string) => api.get('/admin/users', { params: { search } }).then(r => r.data),
  listBuilds: () => api.get('/admin/builds', { params: { per_page: 20 } }).then(r => r.data),
  adjustCredits: (data: { user_id: string; amount: number; reason: string }) =>
    api.post('/admin/billing/adjust', data).then(r => r.data),
  exportUsers: (search?: string) =>
    api
      .get('/admin/users/export', { params: { search }, responseType: 'blob' })
      .then(r => r.data as Blob),
}
