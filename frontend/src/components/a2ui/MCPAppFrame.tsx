/**
 * Sandboxed MCP App view.
 *
 * Renders an MCP App `ui://` resource (already sanitized by the backend, see
 * backend/core/mcp_apps.py) inside `<iframe srcdoc sandbox="allow-scripts">`.
 *
 * Security invariants (enforced here, independent of the backend):
 * - The sandbox attribute is ALWAYS exactly "allow-scripts". Never
 *   allow-same-origin (the app would share Forge's origin, cookies and
 *   storage), never top-navigation / popups / forms / modals / downloads.
 *   If the backend metadata asks for anything else we refuse to render.
 * - The document must start with the backend-injected
 *   `<meta http-equiv="Content-Security-Policy">` whose policy matches the
 *   `sandbox.csp` metadata and denies by default; otherwise we refuse.
 * - No Permissions-Policy grants (`allow=""`), no referrer.
 * - The HTML is only ever passed as `srcdoc`; it never touches Forge's DOM.
 * - postMessage bridge: only `ui/notifications/size-changed` is accepted, and
 *   only when `event.source` is this iframe's own contentWindow and the
 *   sender's origin is the opaque "null" origin. Everything else is ignored.
 *   Nothing is ever posted into the frame.
 */
import { useEffect, useRef, useState } from "react"
import type { MCPAppResourcePayload } from "../../lib/kernelApi"
import {
  MCP_APP_DEFAULT_HEIGHT,
  MCP_APP_IFRAME_SANDBOX,
  MCP_APP_MAX_HEIGHT,
  MCP_APP_MIN_HEIGHT,
  describeMCPAppError,
  parseSizeChangedMessage,
  validateMCPAppResource,
} from "./mcpAppSecurity"

type FrameState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: MCPAppResourcePayload }

export interface MCPAppFrameProps {
  title: string
  /** Fetches the sanitized resource (GET .../protocols/mcp/apps/{app_id}/resource). */
  loadResource: () => Promise<MCPAppResourcePayload>
  initialHeight?: number
}

export function MCPAppFrame({ title, loadResource, initialHeight = MCP_APP_DEFAULT_HEIGHT }: MCPAppFrameProps) {
  const [state, setState] = useState<FrameState>({ kind: "loading" })
  const [height, setHeight] = useState<number>(initialHeight)
  const [attempt, setAttempt] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadRef = useRef(loadResource)
  loadRef.current = loadResource

  useEffect(() => {
    let cancelled = false
    setState({ kind: "loading" })
    loadRef
      .current()
      .then((payload) => {
        if (cancelled) return
        const check = validateMCPAppResource(payload)
        setState(check.ok ? { kind: "ready", payload } : { kind: "error", message: check.reason })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: "error", message: describeMCPAppError(err) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const ready = state.kind === "ready"
  useEffect(() => {
    if (!ready) return
    const onMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow
      if (!frameWindow || event.source !== frameWindow) return
      if (event.origin !== "null") return
      const next = parseSizeChangedMessage(event.data)
      if (next !== null) setHeight(next)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [ready])

  if (state.kind === "loading") {
    return (
      <div role="status" className="rounded border border-border bg-panel-alt px-2.5 py-2 text-[11px] text-muted">
        Loading MCP App view…
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div role="alert" className="rounded border border-error/40 bg-error/10 px-2.5 py-2 text-[11px] text-error space-y-1">
        <p>{state.message}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="px-2 py-0.5 rounded border border-border bg-base text-[11px] text-ink cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  const { payload } = state
  return (
    <div className="space-y-1">
      <div
        data-testid="mcp-app-frame-container"
        className={`relative w-full overflow-hidden rounded ${payload.sandbox.prefers_border ? "border border-border" : ""}`}
        style={{ height, minHeight: MCP_APP_MIN_HEIGHT, maxHeight: MCP_APP_MAX_HEIGHT, resize: "vertical" }}
      >
        <iframe
          ref={iframeRef}
          title={title}
          // Exactly "allow-scripts": never allow-same-origin / top-navigation / popups / forms.
          sandbox={MCP_APP_IFRAME_SANDBOX}
          srcDoc={payload.html}
          allow=""
          referrerPolicy="no-referrer"
          className="h-full w-full bg-panel"
        />
      </div>
      {payload.warnings.length > 0 && (
        <ul className="text-[10px] text-warn list-disc pl-4">
          {payload.warnings.slice(0, 8).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <p className="text-[10px] font-mono text-faint truncate">
        {payload.resource_uri} · sandbox: {MCP_APP_IFRAME_SANDBOX}
      </p>
    </div>
  )
}
