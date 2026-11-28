/**
 * What goes inside a window or panel, by `WindowState.kind`:
 *  - surface       -> WS-B SurfaceView (generated UI)
 *  - legacy_route  -> LegacyRouteWindow (an existing page)
 *  - capability    -> WS-D renderer, the shell's own system.* views, or a hint
 *  - mcp_app       -> WS-B MCP App host
 */
import { Suspense, useCallback } from "react"
import { Sparkles } from "lucide-react"
import type { CapabilityRendererProps, WindowState } from "../contracts"
import { ErrorBoundary } from "../../components/ui/ErrorBoundary"
import { useActiveProject } from "../../hooks/useActiveProject"
import { McpAppView, SurfaceView, getCapability, resolveCapabilityRenderer } from "./adapters"
import { CapabilityLibrary } from "./CapabilityLibrary"
import { LegacyRouteWindow, type WindowHistory } from "./LegacyRouteWindow"
import { SessionsList } from "./NavHistoryPanel"
import { dispatchSurfaceAction } from "./sessionController"
import { useWindowStore } from "./windowStore"

function CapabilityHint({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink/[0.06] text-muted">
        <Sparkles size={16} aria-hidden="true" />
      </span>
      <p className="text-body font-medium text-ink">{title}</p>
      <p className="max-w-sm text-caption text-muted">
        {summary || "This view is generated for you."} Ask for it in the prompt and Forge builds it with your data.
      </p>
    </div>
  )
}

export function WindowContent({ win, history }: { win: WindowState; history: WindowHistory | null }) {
  const close = useWindowStore((s) => s.close)
  const setTitle = useWindowStore((s) => s.setTitle)
  const { activeProjectId } = useActiveProject()
  const onAction = useCallback(
    (action: Parameters<typeof dispatchSurfaceAction>[1], source: string) =>
      win.surface_id && dispatchSurfaceAction(win.surface_id, action, source),
    [win.surface_id],
  )

  if (win.kind === "legacy_route" && win.route && history) {
    return <LegacyRouteWindow route={win.route} history={history} />
  }
  if (win.kind === "surface" && win.surface_id) {
    return (
      <div className="p-5">
        <SurfaceView surfaceId={win.surface_id} onAction={onAction} />
      </div>
    )
  }
  if (win.kind === "mcp_app" && win.app_id) {
    return <McpAppView appId={win.app_id} params={win.params ?? {}} />
  }
  const cap = win.capability_id ? getCapability(win.capability_id) : undefined
  if (win.capability_id === "system.capability_library") return <CapabilityLibrary embedded />
  if (win.capability_id === "system.sessions") return <SessionsList />
  if (!cap) return <CapabilityHint title={win.title} summary="" />
  const Renderer = resolveCapabilityRenderer(cap)
  if (Renderer) {
    const props: CapabilityRendererProps = {
      capability: cap,
      windowId: win.id,
      presentation: win.presentation,
      params: win.params ?? {},
      projectId: activeProjectId ?? null,
      sessionId: win.session_id ?? null,
      setTitle: (t) => setTitle(win.id, t),
      close: () => close(win.id),
    }
    return (
      <ErrorBoundary>
        <Suspense fallback={<div className="p-6 text-caption text-muted" role="status">Opening…</div>}>
          <Renderer {...props} />
        </Suspense>
      </ErrorBoundary>
    )
  }
  return <CapabilityHint title={cap.title} summary={cap.summary} />
}
