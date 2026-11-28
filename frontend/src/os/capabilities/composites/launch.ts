import { createContext, useContext } from "react"
import type { CapabilityId, JsonObject } from "../../contracts"

export type LaunchCapability = (capabilityId: CapabilityId, params: JsonObject) => void

/**
 * How a CapabilityLauncher opens a capability.
 *
 * SWAP POINT: WS-A's window manager provides this (open the capability's
 * renderer in a window or panel). Without a provider the launcher falls back
 * to the capability's legacy route, which keeps working everywhere.
 */
export const CapabilityLaunchContext = createContext<LaunchCapability | null>(null)

export function useCapabilityLaunch(): LaunchCapability | null {
  return useContext(CapabilityLaunchContext)
}
