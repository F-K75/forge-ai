// S0 privacy controls for shadow reviews and human adjudication
// (docs/architecture/agent-collaboration-plan.md §5.4, §17.3).
//
// - dataUseConsentsApi: the user's own data-use consents (backend
//   api/data_use_consents.py). ai_quality_review and human_quality_review are
//   S0's; platform_model_processing and byok_auto_retry are A2's.
// - adjudicationApi: the admin-only adjudication queue (backend
//   api/adjudication.py). Every call is recorded in the access log.
import { api } from "./api"

export type ConsentScope =
  | "platform_model_processing"
  | "byok_auto_retry"
  | "ai_quality_review"
  | "human_quality_review"

export interface ConsentRecord {
  scope: ConsentScope
  policy_version: string
  granted_at: string | null
  revoked_at: string | null
  max_retries?: number | null
}

export interface ConsentsResponse {
  policy_version: string
  policy_versions: Partial<Record<ConsentScope, string>>
  grantable: Partial<Record<ConsentScope, boolean>>
  active: ConsentScope[]
  byok_auto_retry_max: number
  quality_review: {
    is_internal: boolean
    external_adjudication_available: boolean
  }
  consents: ConsentRecord[]
}

export const dataUseConsentsApi = {
  get: (): Promise<ConsentsResponse> => api.get("/api/consents").then((r) => r.data),
  grant: (scope: ConsentScope, policyVersion?: string) =>
    api.put(`/api/consents/${scope}`, { policy_version: policyVersion }).then((r) => r.data),
  revoke: (scope: ConsentScope) => api.delete(`/api/consents/${scope}`).then((r) => r.data),
}

export type AdjudicationStatus = "pending" | "labelled"
export type AdjudicationVerdict = "true_positive" | "false_positive" | "uncertain"

export interface AdjudicationQueueItem {
  item_id: string
  finding_id: string
  build_id: string
  file: string | null
  line: number | null
  rule_or_category: string | null
  status: AdjudicationStatus
  consent_basis: "internal" | "opt_in"
  created_at: string
  expires_at: string
}

export interface AdjudicationFinding {
  finding_id: string
  build_id: string
  file: string | null
  line: number | null
  rule_or_category: string
  message: string | null
}

export interface RedactionReport {
  redactor_version?: number
  total: number
  counts: Record<string, number>
  fields?: Record<string, { total: number; counts: Record<string, number> }>
}

export interface AdjudicationLabel {
  id: string
  finding_id: string
  verdict: AdjudicationVerdict
  corrected_category: string | null
  notes: string | null
  adjudicator_id: string
  created_at: string
  updated_at: string
}

export interface AdjudicationItemView {
  item_id: string
  finding: AdjudicationFinding
  file: string | null
  excerpt_start_line: number
  excerpt_end_line: number
  redacted_excerpt: string
  blueprint_fragment: Record<string, unknown>
  redaction_report: RedactionReport
  consent_basis: "internal" | "opt_in"
  status: AdjudicationStatus
  created_at: string
  expires_at: string
  my_label: AdjudicationLabel | null
}

export interface AdjudicationExpansion {
  item_id: string
  target: "artifact" | "prompt"
  artifact_id: string | null
  path: string | null
  content: string
  truncated: boolean
  redaction_report: RedactionReport
}

// Mirrors backend core/adjudication.py MIN_PURPOSE_CHARS.
export const MIN_EXPAND_PURPOSE_CHARS = 10

export const adjudicationApi = {
  queue: (status: AdjudicationStatus = "pending") =>
    api
      .get("/admin/adjudication/queue", { params: { status } })
      .then((r) => r.data as { items: AdjudicationQueueItem[]; count: number }),
  item: (itemId: string) =>
    api.get(`/admin/adjudication/items/${itemId}`).then((r) => r.data as AdjudicationItemView),
  expand: (itemId: string, purpose: string, target: "artifact" | "prompt" = "artifact") =>
    api
      .post(`/admin/adjudication/items/${itemId}/expand`, { purpose, target })
      .then((r) => r.data as AdjudicationExpansion),
  label: (
    itemId: string,
    body: { verdict: AdjudicationVerdict; corrected_category?: string; notes?: string },
  ) =>
    api.post(`/admin/adjudication/items/${itemId}/label`, body).then((r) => r.data as AdjudicationLabel),
}
