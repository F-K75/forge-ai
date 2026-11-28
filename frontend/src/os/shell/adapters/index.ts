/**
 * THE integration seam of the OS shell. Every dependency WS-A has on WS-B
 * (stream + generated UI), WS-C (backend) and WS-D (capabilities) goes through
 * this one file, typed against src/os/contracts.ts.
 *
 *   WS-B  stream + surface store + SurfaceView + MCPAppSurface   -> wired (src/os/stream, src/os/genui)
 *   WS-C  osBackend   -> `liveOsBackend` in live mode; the in-browser fake
 *                        (../fake/fakeOsBackend) in demo mode, which also
 *                        stands in for the stream there
 *   WS-D  useCapabilities / getCapability / resolveCapabilityRenderer
 *                     -> still ./capabilityShim (index-derived descriptors);
 *                        swap to `../../capabilities` here when WS-D lands
 */
import type { ComponentType } from "react"
import { LIVE_MODE } from "../../../lib/env"
import { useAuthStore } from "../../../store/authStore"
import type {
  CapabilityDescriptor,
  CapabilityRendererProps,
  OsEvent,
  OsId,
  StoredSurface,
  SubscribeSession,
} from "../../contracts"
import { defaultSurfaceStore, type SurfaceStore } from "../../genui"
import { subscribeSession as liveSubscribeSession } from "../../stream"
import { createFakeOsBackend } from "../fake/fakeOsBackend"
import { liveOsBackend, type OsBackend } from "../sessionsApi"
import { getShimCapability, useShimCapabilities, type UseCapabilitiesResult } from "./capabilityShim"

export { SurfaceView, MCPAppSurface, GenUIProvider, TextFallback, surfaceToText } from "../../genui"

// --- WS-C: backend --------------------------------------------------------
const fake = LIVE_MODE ? null : createFakeOsBackend()

/** Sessions, turns, actions, attachments, models and workspace persistence. */
export const osBackend: OsBackend = fake ?? liveOsBackend

// --- WS-B: stream ---------------------------------------------------------
/** Session event stream (validated, resumable). Demo mode replays the fake's log. */
export const subscribeSession: SubscribeSession = fake ? fake.subscribe : liveSubscribeSession

// --- WS-B: generated surfaces ----------------------------------------------
/** The one surface store the shell renders from. */
export const surfaceStore: SurfaceStore = defaultSurfaceStore
/** Route every stream event into the surface store (a2ui, placements, progress, action results). */
export const applySurfaceEvent = (event: OsEvent) => surfaceStore.getState().applyEvent(event)
/** Record a frame the stream client rejected (marks the affected surface failed). */
export const rejectSurfaceEvent = (raw: unknown, errors: { path: string; message: string }[]) =>
  surfaceStore.getState().rejectEvent(raw, errors)
/** Hydrate a surface snapshot when restoring a session. */
export const hydrateSurface = (stored: StoredSurface) => surfaceStore.getState().hydrate([stored], { sessionId: stored.session_id })
/** Whether the store holds a generated surface with this id (vs a capability placement). */
export const hasSurface = (surfaceId: OsId): boolean => Boolean(surfaceStore.getState().surfaces[surfaceId])

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
