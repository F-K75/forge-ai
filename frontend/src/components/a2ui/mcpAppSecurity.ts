/**
 * Pure, DOM-free security checks for MCP App resources (see MCPAppFrame.tsx).
 */
import type { MCPAppResourcePayload } from "../../lib/kernelApi"

export const MCP_APP_IFRAME_SANDBOX = "allow-scripts"
export const MCP_APP_MAX_HTML_BYTES = 256 * 1024
export const MCP_APP_MIN_HEIGHT = 80
export const MCP_APP_MAX_HEIGHT = 800
export const MCP_APP_DEFAULT_HEIGHT = 240

const CSP_META_RE =
  /^\uFEFF?\s*(?:<!doctype[^>]*>\s*)?<meta\s+http-equiv\s*=\s*"Content-Security-Policy"\s+content\s*=\s*"([^"]*)"\s*\/?>/i

function decodeAttr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

export type MCPAppValidation = { ok: true; csp: string } | { ok: false; reason: string }

/** Client-side check that a resource payload is safe to hand to a sandboxed iframe. */
export function validateMCPAppResource(payload: unknown): MCPAppValidation {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "Malformed MCP App resource" }
  const p = payload as Partial<MCPAppResourcePayload>
  const sandbox = p.sandbox
  if (typeof p.html !== "string" || !sandbox || typeof sandbox !== "object") {
    return { ok: false, reason: "Malformed MCP App resource" }
  }
  if (sandbox.render_mode !== "iframe-srcdoc") {
    return { ok: false, reason: "Unsupported MCP App render mode" }
  }
  const tokens = String(sandbox.iframe_sandbox ?? "").trim().split(/\s+/).filter(Boolean)
  if (tokens.length !== 1 || tokens[0] !== MCP_APP_IFRAME_SANDBOX) {
    return { ok: false, reason: "MCP App requested sandbox capabilities beyond allow-scripts" }
  }
  if (typeof sandbox.iframe_allow === "string" && sandbox.iframe_allow.trim() !== "") {
    return { ok: false, reason: "MCP App requested device permissions" }
  }
  if (new TextEncoder().encode(p.html).length > MCP_APP_MAX_HTML_BYTES) {
    return { ok: false, reason: "MCP App resource exceeds the size limit" }
  }
  const match = CSP_META_RE.exec(p.html)
  if (!match) {
    return { ok: false, reason: "MCP App resource is missing its Content-Security-Policy" }
  }
  const csp = decodeAttr(match[1]).trim()
  if (!/(^|;)\s*default-src\s+'none'\s*(;|$)/i.test(csp)) {
    return { ok: false, reason: "MCP App Content-Security-Policy is not deny-by-default" }
  }
  if (typeof sandbox.csp === "string" && sandbox.csp.trim() !== csp) {
    return { ok: false, reason: "MCP App Content-Security-Policy does not match its metadata" }
  }
  return { ok: true, csp }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "This MCP App does not declare a valid UI resource.",
  403: "Your role or department is not permitted to open this MCP App.",
  404: "MCP App or its UI resource was not found.",
  413: "The MCP App UI resource is too large to display.",
  415: "The MCP App UI resource has an unsupported content type.",
  502: "The MCP App server failed to return its UI resource.",
}

export function describeMCPAppError(err: unknown): string {
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status
  if (typeof status === "number" && STATUS_MESSAGES[status]) {
    return `${STATUS_MESSAGES[status]} (HTTP ${status})`
  }
  if (typeof status === "number") return `Unable to load MCP App view (HTTP ${status}).`
  return "Unable to load MCP App view."
}

/** Returns a clamped height if `data` is a well-formed size-changed notification. */
export function parseSizeChangedMessage(data: unknown): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const msg = data as Record<string, unknown>
  if (msg.jsonrpc !== "2.0" || msg.method !== "ui/notifications/size-changed") return null
  const params = msg.params
  if (!params || typeof params !== "object" || Array.isArray(params)) return null
  const height = (params as Record<string, unknown>).height
  if (typeof height !== "number" || !Number.isFinite(height)) return null
  return Math.round(Math.min(MCP_APP_MAX_HEIGHT, Math.max(MCP_APP_MIN_HEIGHT, height)))
}
