/**
 * THE integration seam of the OS shell. Every dependency WS-A has on WS-B
 * (stream + generated UI), WS-C (backend) and WS-D (capabilities) goes through
 * this one file, typed against src/os/contracts.ts. Swapping a fake for the
 * real module is a change here only:
 *
 *   WS-B  subscribeSession   -> `import { subscribeSession } from "../../stream/osStreamClient"`
 *   WS-B  SurfaceView        -> `import { SurfaceView } from "../../genui/SurfaceView"`
 *   WS-B  McpAppView         -> `import { MCPAppSurface } from "../../genui/mcp/MCPAppSurface"`
 *   WS-B  applySurfaceMessage / hydrateSurface -> the genui surfaceStore (or no-ops
 *         if osStreamClient already feeds the surface store itself)
 *   WS-D  useCapabilities / getCapability     -> `../../capabilities`
 *   WS-D  resolveCapabilityRenderer           -> `../../capabilities`
 *   WS-C  osBackend          -> `liveOsBackend` once `/v1/os/*` is deployed (already
 *         the default in live mode)
 */
import type { ComponentType } from "react"
import { LIVE_MODE } from "../../../lib/env"
import { useAuthStore } from "../../../store/authStore"
import type {
  A2UIAction,
  A2UIServerMessage,
  CapabilityDescriptor,
  CapabilityRendererProps,
  OsId,
  StoredSurface,
  SubscribeSession,
} from "../../contracts"
import { createFakeOsBackend } from "../fake/fakeOsBackend"
import { liveOsBackend, type OsBackend } from "../sessionsApi"
import { getShimCapability, useShimCapabilities, type UseCapabilitiesResult } from "./capabilityShim"
import { liveSubscribeSession } from "./liveStreamShim"
import { ShimMcpAppView } from "./mcpAppShim"
import { ShimSurfaceView, shimApplyMessage, shimHasSurface, shimHydrate } from "./surfaceShim"

// --- WS-C: backend --------------------------------------------------------
const fake = LIVE_MODE ? null : createFakeOsBackend()

/** Sessions, turns, actions, attachments, models and workspace persistence. */
export const osBackend: OsBackend = fake ?? liveOsBackend

// --- WS-B: stream ---------------------------------------------------------
/** Session event stream (validated, resumable). */
export const subscribeSession: SubscribeSession = fake ? fake.subscribe : liveSubscribeSession

// --- WS-B: generated surfaces ----------------------------------------------
export interface SurfaceViewProps {
  surfaceId: OsId
  /** Dispatch an A2UI action from a component (the shell posts it to /actions). */
  onAction?: (action: A2UIAction, sourceComponentId: string) => void
}
/** Renders one generated surface from the surface store, with a text fallback. */
export const SurfaceView: ComponentType<SurfaceViewProps> = ShimSurfaceView
/** Apply an `a2ui.message` event to the surface store (in stream order). */
export const applySurfaceMessage: (message: A2UIServerMessage) => void = shimApplyMessage
/** Hydrate a surface snapshot when restoring a session. */
export const hydrateSurface: (stored: StoredSurface) => void = shimHydrate
/** Whether the store holds a generated surface with this id (vs a capability placement). */
export const hasSurface: (surfaceId: OsId) => boolean = shimHasSurface

/** Hosts an MCP App placed by `mcp_app.placed` (sandboxed iframe in WS-B). */
export const McpAppView: ComponentType<{ appId: OsId; params: Record<string, unknown> }> = ShimMcpAppView

// --- WS-D: capabilities -------------------------------------------------------
/** Capabilities the caller may use (React Query over GET /v1/os/capabilities in WS-D). */
export function useCapabilities(): UseCapabilitiesResult {
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true)
  return useShimCapabilities({ isAdmin })
}
/** Synchronous lookup (placement handling outside React). */
export const getCapability: (id: string) => CapabilityDescriptor | undefined = getShimCapability

/**
 * WS-D: `component_key` -> lazily loaded renderer taking CapabilityRendererProps.
 * Returning null lets the shell fall back to the capability's legacy route, its
 * built-in renderers (system.*) or a "ask for it in a prompt" placeholder.
 */
export function resolveCapabilityRenderer(
  _capability: CapabilityDescriptor,
): ComponentType<CapabilityRendererProps> | null {
  return null
}

export type { UseCapabilitiesResult }
