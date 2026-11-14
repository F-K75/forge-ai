import axios from "axios"

// Vite env typing fallback (prevents TS error in some toolchains)
const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000"

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
})

// The backend requires an X-CSRF-Token header on every state-changing
// request (see backend/core/security.py's csrf_protection_middleware).
// These paths are excluded server-side (no session yet, or have their own
// signature verification) so there's no token to fetch for them.
const CSRF_EXEMPT_PATHS = [
  "/v1/auth/login",
  "/v1/auth/register",
  "/v1/auth/forgot-password",
  "/v1/auth/reset-password",
  "/billing/webhook",
]

let csrfTokenPromise: Promise<string> | null = null
function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = api
      .get("/v1/auth/csrf-token")
      .then((r) => r.data.csrf_token)
      .catch((err) => {
        csrfTokenPromise = null
        throw err
      })
  }
  return csrfTokenPromise
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase()
  const isMutating = method !== "get" && method !== "head" && method !== "options"
  const exempt = CSRF_EXEMPT_PATHS.some((p) => config.url?.includes(p))
  if (isMutating && !exempt) {
    try {
      const token = await getCsrfToken()
      config.headers = config.headers ?? {}
      config.headers["X-CSRF-Token"] = token
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
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      csrfTokenPromise = null
    }
    return Promise.reject(err)
  }
)

// Auth
export const authApi = {
  register: (data: { email: string; name: string; password: string }) =>
    api.post("/v1/auth/register", data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post("/v1/auth/login", data).then((r) => r.data),
  refresh: (refresh_token: string) =>
    api.post("/v1/auth/refresh", { refresh_token }).then((r) => r.data),
  logout: () => api.post("/v1/auth/logout").then((r) => r.data),
  me: () => api.get("/v1/auth/me").then((r) => r.data),
  updateProfile: (data: {
    name?: string
    avatar_url?: string
    github_token?: string
    llm_provider?: "anthropic" | "openai_compatible"
    llm_api_key?: string
    llm_base_url?: string
    llm_model?: string
    preferences?: Record<string, unknown>
  }) => api.put("/v1/auth/me", data).then((r) => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post("/v1/auth/me/password", data).then((r) => r.data),
  organizations: {
    create: (data: { name: string; slug?: string }) =>
      api.post("/v1/auth/organizations", data).then((r) => r.data),
    list: () => api.get("/v1/auth/organizations").then((r) => r.data.organizations),
    get: (id: string) => api.get(`/v1/auth/organizations/${id}`).then((r) => r.data),
    invite: (id: string, data: { email: string; role?: string }) =>
      api.post(`/v1/auth/organizations/${id}/invite`, data).then((r) => r.data),
    members: (id: string) =>
      api.get(`/v1/auth/organizations/${id}/members`).then((r) => r.data.members),
    acceptInvite: (token: string) =>
      api.post(`/v1/auth/organizations/invitations/${token}/accept`).then((r) => r.data),
  },
  sessions: {
    list: () => api.get("/v1/auth/sessions").then((r) => r.data),
    revoke: (id: string) => api.delete(`/v1/auth/sessions/${id}`).then((r) => r.data),
    revokeAll: () => api.delete("/v1/auth/sessions").then((r) => r.data),
  },
  mfa: {
    setup: () =>
      api.post("/v1/auth/mfa/setup").then((r) => r.data) as Promise<{
        secret: string
        otpauth_uri: string
      }>,
    verifySetup: (code: string) =>
      api.post("/v1/auth/mfa/verify-setup", { code }).then((r) => r.data) as Promise<{
        ok: boolean
        backup_codes: string[]
      }>,
    disable: (password: string) => api.post("/v1/auth/mfa/disable", { password }).then((r) => r.data),
    verify: (mfa_token: string, code: string) =>
      api.post("/v1/auth/mfa/verify", { mfa_token, code }).then((r) => r.data),
  },
  completeOnboarding: () => api.post("/v1/auth/onboarding/complete").then((r) => r.data),
  gdpr: {
    export: () =>
      api.get("/v1/gdpr/export", { responseType: "blob" }).then((r) => r.data),
    delete: (confirm: boolean) =>
      api.delete("/v1/gdpr/delete", { params: { confirm } }).then((r) => r.data),
  },
}

// Projects
export const projectsApi = {
  list: () => api.get("/projects/").then((r) => r.data.projects),
  get: (id: string) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string; template?: string }) =>
    api.post("/projects/", data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then((r) => r.data),
  getBuilds: (id: string) => api.get(`/projects/${id}/builds`).then((r) => r.data.builds),
}

// Repos
export const reposApi = {
  import: (data: { repo_url: string; project_name?: string; branch?: string; github_token?: string }) =>
    api.post("/v1/repos/import", data).then((r) => r.data),
}

// Builds
export const buildsApi = {
  create: (data: { project_id: string; prompt: string; interactive?: boolean }) =>
    api.post("/v1/builds/", data).then((r) => r.data),
  get: (id: string) => api.get(`/v1/builds/${id}`).then((r) => r.data),
  getFiles: (id: string) => api.get(`/v1/builds/${id}/files`).then((r) => r.data),
  rollback: (id: string, version: number) =>
    api.post(`/v1/builds/${id}/rollback/${version}`).then((r) => r.data),
  // Resolves an interactive build's pending gate — see
  // backend/core/orchestrator.py's _wait_for_gate and POST /v1/builds/{id}/gate.
  respondToGate: (buildId: string, data: { gate_id: string; action: "approve" | "cancel" | "answers"; answers?: string[] }) =>
    api.post(`/v1/builds/${buildId}/gate`, data).then((r) => r.data),
}

// Billing
export const billingApi = {
  provider: () => api.get("/billing/provider").then((r) => r.data),
  checkout: (data: {
    plan: string
    success_url: string
    cancel_url: string
    interval?: "monthly" | "annual"
  }) => api.post("/billing/checkout", data).then((r) => r.data),
  subscription: () => api.get("/billing/subscription").then((r) => r.data),
  invoices: () => api.get("/billing/invoices").then((r) => r.data.invoices),
  usage: () => api.get("/billing/usage").then((r) => r.data),
  plans: () => api.get("/billing/plans").then((r) => r.data),
  cancel: (at_period_end: boolean) =>
    api.post("/billing/cancel", { at_period_end }).then((r) => r.data),
  reactivate: () => api.post("/billing/reactivate").then((r) => r.data),
  downgrade: (plan: string) => api.post("/billing/downgrade", { plan }).then((r) => r.data),
  purchaseCredits: (package_id: string) =>
    api.post("/billing/credits/purchase", { package_id }).then((r) => r.data),
  portal: (return_url: string) => api.post("/billing/portal", { return_url }).then((r) => r.data),
}

// Analytics
export const analyticsApi = {
  track: (event_name: string, project_id?: string, properties?: any) =>
    api.post("/analytics/event", { event_name, project_id, properties }).then((r) => r.data),
  funnel: (days?: number) => api.get("/analytics/funnel", { params: { days } }).then((r) => r.data),
  retention: (days?: number) =>
    api.get("/analytics/retention", { params: { days } }).then((r) => r.data),
  buildSuccess: (days?: number) =>
    api.get("/analytics/builds/success-rate", { params: { days } }).then((r) => r.data),
  personal: (days?: number) => api.get("/analytics/me", { params: { days } }).then((r) => r.data),
}

// Flow / agent pipeline data
export const flowApi = {
  personalAnalytics: (days?: number) => analyticsApi.personal(days),
  agentStats: () => api.get("/engineering/metrics/agent-stats").then((r) => r.data),
}

// Deployments
export const deploymentsApi = {
  create: (data: { build_id: string; project_id: string }) =>
    api.post("/deployments/", data).then((r) => r.data),
  list: (project_id?: string) =>
    api.get("/deployments/", { params: { project_id } }).then((r) => r.data),
  get: (id: string) => api.get(`/deployments/${id}`).then((r) => r.data),
  cancel: (id: string) => api.delete(`/deployments/${id}`).then((r) => r.data),
  logs: (id: string) => api.get(`/deployments/${id}/logs`).then((r) => r.data),
  pushToGitHub: (data: {
    project_id: string
    build_id: string
    repo_url: string
    github_token: string
  }) => api.post("/deployments/github/push", data).then((r) => r.data),
}

// Integrations
export const integrationsApi = {
  getPlaybooks: () => api.get("/integrations/playbooks").then((r) => r.data),
}

// API Keys
export interface ApiKeyItem {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  created_at: string
  last_used_at?: string | null
  expires_at?: string | null
  key?: string
}

export const apiKeysApi = {
  list: (): Promise<ApiKeyItem[]> => api.get("/api-keys/").then((r) => r.data.api_keys),
  create: (data: { name: string; scopes?: string[]; expires_in_days?: number }): Promise<ApiKeyItem> =>
    api.post("/api-keys/", data).then((r) => r.data),
  delete: (id: string): Promise<{ ok: boolean }> => api.delete(`/api-keys/${id}`).then((r) => r.data),
}

// Webhooks
export interface WebhookItem {
  id: string
  url: string
  events: string[]
  active: boolean
  created_at: string
  last_triggered?: string | null
  secret?: string
}

export const webhooksApi = {
  list: (): Promise<WebhookItem[]> => api.get("/webhooks/").then((r) => r.data.webhooks),
  create: (data: { url: string; events?: string[]; active?: boolean }): Promise<WebhookItem> =>
    api.post("/webhooks/", data).then((r) => r.data),
  delete: (id: string): Promise<{ ok: boolean }> => api.delete(`/webhooks/${id}`).then((r) => r.data),
}

// Notifications (Module 15 of the Agile PM layer reuses this existing collection)
export const notificationsApi = {
  list: (page?: number) =>
    api
      .get("/growth/notifications", { params: { page } })
      .then((r) => r.data.notifications) as Promise<
      {
        id: string
        title: string
        message: string
        type: string
        created_at: string
        read_at?: string | null
      }[]
    >,
  markRead: (id: string) => api.post(`/growth/notifications/${id}/read`).then((r) => r.data),
}

// Marketing-email opt-in (onboarding tips and reminders). Account emails --
// verification, password reset, billing -- are always sent. The unsubscribe
// link in those emails writes the same setting (backend/api/email_prefs.py).
export interface EmailPreferences {
  marketing_emails: boolean
}

export const emailPreferencesApi = {
  get: (): Promise<EmailPreferences> => api.get("/v1/email/preferences").then((r) => r.data),
  update: (data: EmailPreferences): Promise<EmailPreferences> =>
    api.put("/v1/email/preferences", data).then((r) => r.data),
}

// Support
export interface SupportTicketItem {
  id: string
  subject: string
  description: string
  priority: string
  status: string
  created_at: string
  updated_at?: string
}

export const supportApi = {
  create: (data: { subject: string; description: string; priority?: string }): Promise<SupportTicketItem> =>
    api.post("/support/tickets", data).then((r) => r.data),
  list: (page?: number): Promise<SupportTicketItem[]> =>
    api.get("/support/tickets", { params: { page } }).then((r) => r.data.tickets),
}

// Marketplace
export const marketplaceApi = {
  list: (params?: { type?: string; search?: string; page?: number; per_page?: number }) =>
    api.get("/marketplace/", { params }).then((r) => r.data.items),
  get: (id: string) => api.get(`/marketplace/${id}`).then((r) => r.data),
  download: (id: string) => api.post(`/marketplace/${id}/download`).then((r) => r.data),
  rate: (id: string, rating: number) =>
    api.post(`/marketplace/${id}/rate`, null, { params: { rating } }).then((r) => r.data),
  create: (data: {
    type?: string
    title: string
    description: string
    prompt: string
    tags?: string[]
    is_public?: boolean
  }) => api.post("/marketplace/", data).then((r) => r.data),
}

// LLM routing (admin-only — see backend/api/llm.py's admin_required gate)
export const llmApi = {
  providers: () => api.get("/api/llm/providers").then((r) => r.data),
  models: () => api.get("/api/llm/models").then((r) => r.data),
  usage: (days?: number, limit?: number) =>
    api.get("/api/llm/usage", { params: { days, limit } }).then((r) => r.data),
  health: () => api.get("/api/llm/health").then((r) => r.data),
  test: (data: {
    agent?: string
    messages: { role: string; content: string }[]
    provider_names?: string[]
    model?: string
  }) => api.post("/api/llm/test", data).then((r) => r.data),
  setAgentOverride: (agent: string, data: { provider?: string; model?: string }) =>
    api.put(`/api/llm/agent/${agent}`, data).then((r) => r.data),
  reload: () => api.post("/api/llm/reload").then((r) => r.data),
}

// AI Optimizer
export const optimizerApi = {
  costBreakdown: (days?: number) =>
    api.get("/api/optimizer/cost-breakdown", { params: { days } }).then((r) => r.data),
  metrics: () => api.get("/api/optimizer/metrics").then((r) => r.data),
  cacheStats: () => api.get("/api/optimizer/cache-stats").then((r) => r.data),
  pricing: () => api.get("/api/optimizer/pricing").then((r) => r.data),
}

// Prompt Builder (templates are admin-only; preview/validate need auth only —
// see backend/api/prompts.py, mounted under /v1)
export interface PromptTemplatePayload {
  role: string
  version: string
  identity: string
  responsibilities: string[]
  goals: string[]
  constraints: string[]
  required_inputs: string[]
  output_format: string
  quality_rules: string[]
}

export interface PromptContextPayload {
  agent_role: string
  task: string
  user_request?: string
  template_version?: string
  relevant_files?: string[]
  previous_outputs?: Record<string, string>
  project_state?: {
    project_name?: string
    tech_stack?: string[]
    architecture_summary?: string
    current_milestone?: string
    completed_tasks?: string[]
    pending_tasks?: string[]
    dependencies?: string[]
    coding_standards?: string
  }
}

export const promptsApi = {
  templates: () => api.get("/v1/prompts/templates").then((r) => r.data),
  template: (role: string, version: string) =>
    api.get(`/v1/prompts/templates/${role}/${version}`).then((r) => r.data),
  createTemplate: (data: PromptTemplatePayload) =>
    api.post("/v1/prompts/templates", data).then((r) => r.data),
  updateTemplate: (role: string, version: string, data: PromptTemplatePayload) =>
    api.put(`/v1/prompts/templates/${role}/${version}`, data).then((r) => r.data),
  deleteTemplate: (role: string, version: string) =>
    api.delete(`/v1/prompts/templates/${role}/${version}`).then((r) => r.data),
  preview: (context: PromptContextPayload) =>
    api.post("/v1/prompts/preview", context).then((r) => r.data),
  validate: (context: PromptContextPayload) =>
    api.post("/v1/prompts/validate", context).then((r) => r.data),
  estimateTokens: (data: { text?: string; context?: PromptContextPayload }) =>
    api.post("/v1/prompts/estimate-tokens", data).then((r) => r.data),
}

// Budget Manager
export const budgetsApi = {
  list: () => api.get("/api/budgets").then((r) => r.data),
  get: (scope: string, scopeId: string) =>
    api.get(`/api/budgets/${scope}/${scopeId}`).then((r) => r.data),
  set: (
    scope: string,
    scopeId: string,
    data: {
      soft_limit_usd?: number | null
      hard_limit_usd?: number | null
      period?: "daily" | "monthly"
    }
  ) => api.put(`/api/budgets/${scope}/${scopeId}`, data).then((r) => r.data),
  remove: (scope: string, scopeId: string) =>
    api.delete(`/api/budgets/${scope}/${scopeId}`).then((r) => r.data),
  spending: (days?: number, limit?: number) =>
    api.get("/api/budgets/analytics/spending", { params: { days, limit } }).then((r) => r.data),
}

// Agent Registry — persistent engineering org per project (see
// backend/api/agent_registry.py, mounted under /v1)
export interface AgentStats {
  tasks_completed: number
  tasks_failed: number
  success_rate: number
  tokens_used: number
  cost_incurred: number
  review_scores: number[]
  avg_review_score?: number | null
  last_active_at?: string | null
}

export interface AgentProfile {
  id: string
  project_id: string
  role: string
  department: string
  display_name: string
  level: "junior" | "mid" | "senior" | "lead" | "principal"
  status: "active" | "idle" | "retired"
  owned_paths: string[]
  preferred_tools: string[]
  strengths: string[]
  weaknesses: string[]
  stats: AgentStats
  decision_log: Array<Record<string, unknown>>
  created_at: string
  retired_at?: string | null
  retired_reason?: string | null
}

export interface Department {
  key: string
  name: string
  agent_ids: string[]
}

export interface EngineeringOrg {
  id: string
  project_id: string
  leadership: {
    cto_agent_id?: string | null
    pm_agent_id?: string | null
    tech_lead_agent_id?: string | null
    architect_agent_id?: string | null
  }
  departments: Department[]
  created_at: string
  updated_at: string
}

export interface RouteAssignment {
  role: string
  department: string
  agent_id: string
  display_name: string
  score: number
  matched_keywords: string[]
}

export interface OwnershipSummaryEntry {
  agent_id: string
  role: string
  department: string
  display_name: string
  file_count: number
  top_level_breakdown: Record<string, number>
}

export interface GraphNode {
  id: string
  type: "agent" | "file" | "build" | "decision"
  label: string
  metadata: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  relation: "owns" | "touched_in" | "ran_as" | "decided"
  metadata: Record<string, unknown>
}

export const agentOrgApi = {
  getOrg: (projectId: string) =>
    api
      .get(`/v1/projects/${projectId}/org`)
      .then((r) => r.data as { org: EngineeringOrg; agents: AgentProfile[] }),
  createAgent: (projectId: string, data: { role: string; department?: string; display_name?: string }) =>
    api
      .post(`/v1/projects/${projectId}/org/agents`, data)
      .then((r) => r.data as { agent: AgentProfile; created: boolean }),
  promote: (projectId: string, agentId: string, data?: { reason?: string; force?: boolean }) =>
    api
      .post(`/v1/projects/${projectId}/org/agents/${agentId}/promote`, data ?? {})
      .then((r) => r.data as AgentProfile),
  retire: (projectId: string, agentId: string, reason?: string) =>
    api
      .post(`/v1/projects/${projectId}/org/agents/${agentId}/retire`, { reason })
      .then((r) => r.data as AgentProfile),
  route: (projectId: string, request: string, max_assignments?: number) =>
    api
      .post(`/v1/projects/${projectId}/org/route`, { request, max_assignments })
      .then((r) => r.data as { assignments: RouteAssignment[] }),
  ownershipSummary: (projectId: string) =>
    api
      .get(`/v1/projects/${projectId}/org/ownership`)
      .then((r) => r.data as { summary: OwnershipSummaryEntry[] }),
  graph: (projectId: string) =>
    api
      .get(`/v1/projects/${projectId}/org/graph`)
      .then((r) => r.data as { nodes: GraphNode[]; edges: GraphEdge[] }),
}

// Admin
export const adminApi = {
  overview: () => api.get("/admin/analytics/overview").then((r) => r.data),
  revenue: (days?: number) =>
    api.get("/admin/analytics/revenue", { params: { days } }).then((r) => r.data),
  aiUsage: (days?: number) =>
    api.get("/admin/analytics/ai-usage", { params: { days } }).then((r) => r.data),
  securityEventsByDay: (days?: number) =>
    api.get("/admin/fraud/events-by-day", { params: { days } }).then((r) => r.data),
  engineeringHealth: () => api.get("/admin/engineering-health").then((r) => r.data),
  systemHealth: () => api.get("/admin/system/health").then((r) => r.data),
  listUsers: (search?: string) =>
    api.get("/admin/users", { params: { search } }).then((r) => r.data),
  listBuilds: () => api.get("/admin/builds", { params: { per_page: 20 } }).then((r) => r.data),
  adjustCredits: (data: { user_id: string; amount: number; reason: string }) =>
    api.post("/admin/billing/adjust", data).then((r) => r.data),
  exportUsers: (search?: string) =>
    api
      .get("/admin/users/export", { params: { search }, responseType: "blob" })
      .then((r) => r.data as Blob),
}
