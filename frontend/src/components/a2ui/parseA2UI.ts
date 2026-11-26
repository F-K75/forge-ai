/**
 * Runtime narrowing for untrusted A2UI wire components (mirrors
 * A2UI_COMPONENT_SCHEMAS in backend/core/protocol_gateway.py). Unknown types,
 * wrong prop types and disallowed enum values yield null; link URLs that are
 * not absolute http(s) are dropped.
 */
import type {
  A2UIAgentStatus,
  A2UIComponent,
  A2UITaskStatus,
  A2UITimelineStatus,
  A2UITone,
} from "../../lib/kernelApi"

// --------------------------------------------------------------------------
// Runtime narrowing helpers
// --------------------------------------------------------------------------

type Raw = Record<string, unknown>

const TONES: readonly A2UITone[] = ["info", "success", "warning", "error"]
const TASK_STATUSES: readonly A2UITaskStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "blocked",
  "cancelled",
]
const AGENT_STATUSES: readonly A2UIAgentStatus[] = [
  "idle",
  "active",
  "completed",
  "failed",
  "blocked",
]
const TIMELINE_STATUSES: readonly A2UITimelineStatus[] = [
  ...TASK_STATUSES,
  "info",
  "answered",
  "rejected",
  "timeout",
]

function isObj(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}
function optStr(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}
/** Map a list, dropping entries the item parser rejects. */
function list<T>(v: unknown, parse: (item: Raw) => T | null, max = 100): T[] | null {
  if (!Array.isArray(v)) return null
  const out: T[] = []
  for (const item of v.slice(0, max)) {
    if (!isObj(item)) continue
    const parsed = parse(item)
    if (parsed !== null) out.push(parsed)
  }
  return out
}

/**
 * Return a normalised absolute http(s) URL, or null. Rejects javascript:,
 * data:, vbscript:, file:, protocol-relative and relative URLs, embedded
 * credentials, and anything containing whitespace/control characters.
 */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return null
  if (!/^https?:\/\//i.test(raw)) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  if (!parsed.hostname || parsed.username || parsed.password) return null
  return parsed.href
}

/** Narrow one untrusted wire component to a typed A2UIComponent, or null. */
export function parseA2UIComponent(raw: unknown): A2UIComponent | null {
  if (!isObj(raw)) return null
  switch (raw.type) {
    case "heading": {
      const text = str(raw.text)
      if (text === undefined) return null
      const level = num(raw.level)
      return {
        type: "heading",
        text,
        level: level === 1 || level === 2 || level === 3 || level === 4 ? level : undefined,
      }
    }
    case "metric_row": {
      const items = list(raw.items, (i) => {
        const label = str(i.label)
        const value = str(i.value)
        return label !== undefined && value !== undefined ? { label, value } : null
      })
      return items ? { type: "metric_row", items } : null
    }
    case "checklist": {
      const items = list(raw.items, (i) => {
        const label = str(i.label)
        return label !== undefined ? { label, checked: i.checked === true } : null
      })
      return items ? { type: "checklist", items } : null
    }
    case "approval_card": {
      const actions = Array.isArray(raw.actions)
        ? raw.actions.filter((a): a is "approve" | "reject" => a === "approve" || a === "reject")
        : []
      return {
        type: "approval_card",
        gate_id: optStr(raw.gate_id),
        gate_name: optStr(raw.gate_name),
        reason: optStr(raw.reason),
        wave_index: num(raw.wave_index) ?? null,
        risk_level: optStr(raw.risk_level),
        actions,
      }
    }
    case "conflict_list": {
      const items = list(raw.items, (i) => ({
        file_path: optStr(i.file_path),
        wave_index: num(i.wave_index) ?? null,
        roles: Array.isArray(i.roles)
          ? i.roles.filter((r): r is string => typeof r === "string")
          : null,
        status: optStr(i.status),
      }))
      return items ? { type: "conflict_list", items } : null
    }
    case "eval_table": {
      const rows = list(raw.rows, (r) => ({
        role: optStr(r.role),
        artifact_type: optStr(r.artifact_type),
        score: num(r.score) ?? null,
        passed: typeof r.passed === "boolean" ? r.passed : null,
      }))
      return rows ? { type: "eval_table", rows } : null
    }
    case "text_block": {
      const text = str(raw.text)
      if (text === undefined) return null
      return { type: "text_block", text, format: raw.format === "markdown" ? "markdown" : "plain" }
    }
    case "key_value_list": {
      const items = list(raw.items, (i) => {
        const key = str(i.key)
        const value = str(i.value)
        return key !== undefined && value !== undefined ? { key, value } : null
      })
      return items ? { type: "key_value_list", items } : null
    }
    case "progress_bar": {
      const label = str(raw.label)
      const value = num(raw.value)
      const max = num(raw.max)
      if (label === undefined || value === undefined || max === undefined) return null
      return { type: "progress_bar", label, value, max, tone: oneOf(raw.tone, TONES) }
    }
    case "timeline": {
      const events = list(raw.events, (e) => {
        const label = str(e.label)
        if (label === undefined) return null
        return {
          label,
          timestamp: optStr(e.timestamp),
          actor: optStr(e.actor),
          status: oneOf(e.status, TIMELINE_STATUSES),
        }
      })
      return events ? { type: "timeline", events } : null
    }
    case "status_list": {
      const items = list(raw.items, (i) => {
        const title = str(i.title)
        const status = oneOf(i.status, TASK_STATUSES)
        if (title === undefined || status === undefined) return null
        return { id: str(i.id), title, status, owner: optStr(i.owner), detail: optStr(i.detail) }
      })
      return items ? { type: "status_list", items } : null
    }
    case "code_diff": {
      const diff = str(raw.diff)
      if (diff === undefined) return null
      return {
        type: "code_diff",
        diff,
        file_path: optStr(raw.file_path),
        language: optStr(raw.language),
      }
    }
    case "cost_breakdown": {
      const total = num(raw.total)
      if (raw.currency !== "USD" || total === undefined) return null
      const items = list(raw.items, (i) => {
        const label = str(i.label)
        const amount = num(i.amount)
        return label !== undefined && amount !== undefined ? { label, amount } : null
      })
      if (!items) return null
      return {
        type: "cost_breakdown",
        currency: "USD",
        total,
        budget: num(raw.budget) ?? null,
        items,
      }
    }
    case "agent_roster": {
      const agents = list(raw.agents, (a) => {
        const role = str(a.role)
        const status = oneOf(a.status, AGENT_STATUSES)
        if (role === undefined || status === undefined) return null
        return {
          role,
          status,
          department: optStr(a.department),
          task_count: num(a.task_count),
          model: optStr(a.model),
        }
      })
      return agents ? { type: "agent_roster", agents } : null
    }
    case "callout": {
      const tone = oneOf(raw.tone, TONES)
      const text = str(raw.text)
      if (tone === undefined || text === undefined) return null
      return { type: "callout", tone, text, title: optStr(raw.title) }
    }
    case "link_list": {
      const links = list(raw.links, (l) => {
        const label = str(l.label)
        const url = safeHttpUrl(l.url)
        return label !== undefined && url !== null ? { label, url } : null
      })
      return links ? { type: "link_list", links } : null
    }
    default:
      return null
  }
}
