/**
 * Route constants and the legacy-route bridge for the Forge OS shell.
 *
 * App.tsx declares every legacy route once (inside `<Routes>`) and hands the
 * same route elements to the OS shell through `LegacyRoutesProvider`, so a
 * `LegacyRouteWindow` can render any existing page inside a window without a
 * second copy of the route table.
 */
import { createContext, useContext, type ReactNode } from "react"
import { matchPath } from "react-router-dom"
import { OS_SHELL_ENABLED } from "../../lib/env"

/** The OS home (minimal workspace). */
export const OS_HOME_PATH = "/os"
/** A restored conversation. */
export const OS_SESSION_PATH = "/os/s/:sessionId"

export function osSessionPath(sessionId: string): string {
  return `/os/s/${encodeURIComponent(sessionId)}`
}

export function isOsPath(pathname: string): boolean {
  return pathname === OS_HOME_PATH || pathname.startsWith(`${OS_HOME_PATH}/`)
}

/** Session id from an /os/s/:sessionId pathname, or null. */
export function sessionIdFromPath(pathname: string): string | null {
  const m = matchPath(OS_SESSION_PATH, pathname)
  return m?.params.sessionId ? decodeURIComponent(m.params.sessionId) : null
}

/** Where a signed-in user lands: the OS when the flag is on, else the Command Center. */
export function authenticatedHomePath(enabled: boolean = OS_SHELL_ENABLED): string {
  return enabled ? OS_HOME_PATH : "/command"
}

const LegacyRoutesContext = createContext<ReactNode>(null)

export function LegacyRoutesProvider({ routes, children }: { routes: ReactNode; children: ReactNode }) {
  return <LegacyRoutesContext.Provider value={routes}>{children}</LegacyRoutesContext.Provider>
}

/** The `<Route>` elements of every legacy in-shell page (see App.tsx). */
// eslint-disable-next-line react-refresh/only-export-components
export function useLegacyRoutes(): ReactNode {
  return useContext(LegacyRoutesContext)
}
