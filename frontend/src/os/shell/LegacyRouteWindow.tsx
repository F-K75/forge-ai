/**
 * Renders an existing route's page inside an OS window.
 *
 * The page sees a normal router: `<Routes location>` matches the window's own
 * route against the same route elements App.tsx declares, `useLocation` /
 * `useParams` return the window's location, and navigation (links,
 * `useNavigate`, `<Navigate>` redirects) is captured by a per-window navigator
 * so it moves this window instead of the browser. Back/forward live in the
 * window's own history.
 */
import { Suspense, useCallback, useMemo, useRef, useState } from "react"
import {
  Routes,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  createPath,
  parsePath,
  type Navigator,
  type To,
} from "react-router-dom"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { ErrorBoundary } from "../../components/ui/ErrorBoundary"
import { useLegacyRoutes } from "./osRoutes"

export type WindowHistory = ReturnType<typeof useWindowHistory>

export interface LegacyRouteWindowProps {
  route: string
  /** From `useWindowHistory(route, onNavigate)` in the window frame (it also drives back/forward). */
  history: WindowHistory
}

function toPath(to: To): string {
  return typeof to === "string" ? to : createPath(to)
}

function WindowSkeleton() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center" role="status">
      <span className="text-caption text-muted">Opening…</span>
    </div>
  )
}

export function useWindowHistory(route: string, onNavigate: (route: string) => void) {
  const stack = useRef<string[]>([route])
  const index = useRef(0)
  const [, force] = useState(0)

  // Keep the stack aligned if the route changes from outside (deep link, restore).
  if (stack.current[index.current] !== route) {
    stack.current = [...stack.current.slice(0, index.current + 1), route]
    index.current = stack.current.length - 1
  }

  const go = useCallback(
    (delta: number) => {
      const next = index.current + delta
      if (next < 0 || next >= stack.current.length) return
      index.current = next
      force((n) => n + 1)
      onNavigate(stack.current[next]!)
    },
    [onNavigate],
  )

  const push = useCallback(
    (path: string, replace: boolean) => {
      if (replace) stack.current[index.current] = path
      else {
        stack.current = [...stack.current.slice(0, index.current + 1), path]
        index.current = stack.current.length - 1
      }
      force((n) => n + 1)
      onNavigate(path)
    },
    [onNavigate],
  )

  return {
    go,
    push,
    canBack: index.current > 0,
    canForward: index.current < stack.current.length - 1,
  }
}

export function LegacyRouteWindow({ route, history }: LegacyRouteWindowProps) {
  const routes = useLegacyRoutes()
  const { push, go } = history

  const navigator = useMemo<Navigator>(
    () => ({
      createHref: (to) => toPath(to),
      encodeLocation: (to) => {
        const p = typeof to === "string" ? parsePath(to) : to
        return { pathname: p.pathname ?? "", search: p.search ?? "", hash: p.hash ?? "" }
      },
      go: (delta) => go(delta),
      push: (to) => push(toPath(to), false),
      replace: (to) => push(toPath(to), true),
    }),
    [go, push],
  )

  const nav = useMemo(
    () => ({ basename: "", navigator, static: false, future: { v7_relativeSplatPath: false } }),
    [navigator],
  )
  // Reset the parent route context so absolute legacy routes match from "/".
  const rootRouteContext = useMemo(() => ({ outlet: null, matches: [], isDataRoute: false }), [])

  return (
    <div className="flex h-full min-h-0 flex-col" data-legacy-route={route}>
      <NavigationContext.Provider value={nav}>
        <RouteContext.Provider value={rootRouteContext}>
          <ErrorBoundary>
            <Suspense fallback={<WindowSkeleton />}>
              <div className="relative min-h-0 flex-1">
                <Routes location={route}>{routes}</Routes>
              </div>
            </Suspense>
          </ErrorBoundary>
        </RouteContext.Provider>
      </NavigationContext.Provider>
    </div>
  )
}

/** Back/forward buttons for a legacy window's title bar. */
export function WindowHistoryButtons({
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
}) {
  const btn =
    "flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  return (
    <>
      <button type="button" className={btn} onClick={onBack} disabled={!canBack} aria-label="Back">
        <ArrowLeft size={13} aria-hidden="true" />
      </button>
      <button type="button" className={btn} onClick={onForward} disabled={!canForward} aria-label="Forward">
        <ArrowRight size={13} aria-hidden="true" />
      </button>
    </>
  )
}
