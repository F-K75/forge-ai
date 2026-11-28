/** Ember Night token classes shared by the registry components (tokens only, no raw colours). */
import type { BadgeVariant } from "../../../components/ui/Badge"

export type Tone = "info" | "success" | "warning" | "error"

export const TONE_PANEL: Record<Tone, string> = {
  info: "border-info/30 bg-info/10",
  success: "border-ok/30 bg-ok/10",
  warning: "border-warn/30 bg-warn/10",
  error: "border-error/30 bg-error/10",
}

export const TONE_TEXT: Record<Tone, string> = {
  info: "text-info",
  success: "text-ok",
  warning: "text-warn",
  error: "text-error",
}

export const TONE_BAR: Record<Tone, string> = {
  info: "bg-info",
  success: "bg-ok",
  warning: "bg-warn",
  error: "bg-error",
}

export const GAP: Record<string, string> = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-6" }

export const CARD = "rounded-xl border border-border bg-panel"
export const LABEL = "text-caption text-muted"
export const SECTION_LABEL = "text-xs font-medium text-faint"
export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
export const FIELD =
  "w-full rounded-lg border border-border bg-panel-alt px-3 py-2 text-body text-ink placeholder:text-faint " + FOCUS

export function statusVariant(status: string | undefined): BadgeVariant {
  switch (status) {
    case "completed":
    case "answered":
    case "passed":
      return "success"
    case "running":
    case "active":
    case "info":
      return "info"
    case "failed":
    case "rejected":
    case "timeout":
      return "error"
    case "blocked":
      return "warning"
    default:
      return "default"
  }
}

export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatUsd(amount: number, digits = 2): string {
  const sign = amount < 0 ? "-" : ""
  return `${sign}$${Math.abs(amount).toFixed(digits)}`
}

/** Render any JSON-ish cell value as plain text (never HTML). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  try {
    const s = JSON.stringify(value)
    return s.length > 200 ? s.slice(0, 199) + "…" : s
  } catch {
    return "—"
  }
}
