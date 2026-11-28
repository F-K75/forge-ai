/**
 * The Forge OS shell: a minimal workspace. Branding, a centred composer, a
 * collapsible nav/history panel and the account menu; everything else
 * (windows, panels, inline surfaces) appears when a prompt, the palette or the
 * library asks for it. After the first prompt the composer docks at the
 * bottom and windows never cover it.
 *
 * The URL tracks the front-most thing: /os (home), /os/s/:id (a session) or
 * a legacy path while a legacy-route window is in front, so every old deep
 * link opens its page in a window over the home.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion } from "motion/react"
import { Columns2, PanelLeft, Search } from "lucide-react"
import BrandLogo from "../../components/BrandLogo"
import { CommandPalette } from "../../components/CommandPalette"
import { DemoBanner } from "../../components/DemoBanner"
import { NotificationsBell } from "../../components/NotificationsBell"
import { openCommandPalette } from "../../lib/commandPalette"
import { useAuthStore } from "../../store/authStore"
import { osBackend } from "./adapters"
import { AccountMenu } from "./AccountMenu"
import { Composer, type ComposerHandle, type ComposerSubmit } from "./Composer"
import { useIsMobile, usePrefersReducedMotion } from "./hooks"
import { NavHistoryPanel } from "./NavHistoryPanel"
import { OS_HOME_PATH, isOsPath, osSessionPath, sessionIdFromPath } from "./osRoutes"
import { useOsPaletteItems } from "./osPalette"
import { PanelDock } from "./PanelDock"
import {
  cancelActiveTurn,
  newSession,
  openLegacyRoute,
  openSession,
  refreshSessions,
  sendPrompt,
  titleForRoute,
} from "./sessionController"
import { DRAFT_SESSION, emptyThread, useSessionStore } from "./sessionStore"
import { Thread } from "./Thread"
import { MinimizedShelf, WindowManager } from "./WindowManager"
import { startWorkspaceSync } from "./workspaceClient"
import { focusedWindow, isWindowVisible, useWindowStore } from "./windowStore"

const SUGGESTIONS = [
  "Show my projects",
  "Chart revenue by region",
  "Compare models for coding",
  "How's run 42 going?",
]

function greeting(name?: string): string {
  const h = new Date().getHours()
  const part = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
  const first = name?.split(/\s+/)[0]
  return first ? `${part}, ${first}.` : `${part}.`
}

const EMPTY = emptyThread(true)

/** Keep the URL and the front-most window/session in step (both directions). */
function useUrlSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const workspace = useWindowStore((s) => s.workspace)
  const current = location.pathname + location.search

  // URL -> state.
  useEffect(() => {
    const path = location.pathname
    if (!isOsPath(path)) {
      const ws = useWindowStore.getState().workspace
      const existing = ws.windows.find((w) => w.kind === "legacy_route" && w.route === current)
      if (existing) useWindowStore.getState().focus(existing.id)
      else openLegacyRoute(current, titleForRoute(current))
      return
    }
    const sid = sessionIdFromPath(path)
    if (sid) {
      useWindowStore.getState().setActiveSession(sid)
      void openSession(sid).then((ok) => {
        if (!ok) {
          newSession()
          navigate(OS_HOME_PATH, { replace: true })
        }
      })
    } else if (path === OS_HOME_PATH) {
      const active = useWindowStore.getState().workspace.active_session_id
      if (active) newSession()
    }
  }, [current, location.pathname, navigate])

  // State -> URL.
  const top = focusedWindow(workspace)
  const desired =
    top && top.kind === "legacy_route" && top.route
      ? top.route
      : workspace.active_session_id
        ? osSessionPath(workspace.active_session_id)
        : OS_HOME_PATH
  useEffect(() => {
    if (desired === current) return
    // A legacy deep link that has no window yet: the effect above is opening it.
    if (!isOsPath(location.pathname)) {
      const pending = !workspace.windows.some((w) => w.kind === "legacy_route" && w.route === current)
      if (pending) return
    }
    navigate(desired, { replace: true })
  }, [desired, current, location.pathname, navigate, workspace.windows])
}

function useShellShortcuts(composer: React.RefObject<ComposerHandle>) {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      if (!e.altKey && !e.metaKey && !e.ctrlKey && e.key === "/" && !typing) {
        e.preventDefault()
        composer.current?.focus()
        return
      }
      if (!e.altKey || e.metaKey || e.ctrlKey) return
      const ws = useWindowStore.getState()
      const top = focusedWindow(ws.workspace)
      let handled = true
      switch (e.code) {
        case "KeyT":
          ws.tile()
          break
        case "KeyW":
          if (top) ws.close(top.id)
          break
        case "KeyM":
          if (top) ws.minimize(top.id)
          break
        case "Enter":
          if (top) ws.toggleMaximize(top.id)
          break
        case "Backquote":
          ws.cycleFocus(e.shiftKey ? -1 : 1)
          break
        case "Backslash":
          ws.setNavCollapsed(!ws.workspace.nav_collapsed)
          break
        case "KeyN":
          newSession()
          navigate(OS_HOME_PATH)
          requestAnimationFrame(() => composer.current?.focus())
          break
        default:
          handled = false
      }
      if (handled) e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [composer, navigate])
}

export default function OsHome() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const mobile = useIsMobile()
  const reduceMotion = usePrefersReducedMotion()
  const composerRef = useRef<ComposerHandle>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(112)
  const [mobileNav, setMobileNav] = useState(false)

  const workspace = useWindowStore((s) => s.workspace)
  const setNavCollapsed = useWindowStore((s) => s.setNavCollapsed)
  const tile = useWindowStore((s) => s.tile)
  const activeId = workspace.active_session_id
  const thread = useSessionStore((s) => s.threads[activeId ?? DRAFT_SESSION]) ?? EMPTY
  const session = useSessionStore((s) => (activeId ? s.sessions.find((x) => x.id === activeId) : undefined))
  const { items, queryAction } = useOsPaletteItems()

  useEffect(() => {
    const sync = startWorkspaceSync({ transport: osBackend.workspace })
    void refreshSessions()
    const flush = () => void sync.flush()
    window.addEventListener("beforeunload", flush)
    return () => {
      window.removeEventListener("beforeunload", flush)
      sync.stop()
    }
  }, [])

  useUrlSync()
  useShellShortcuts(composerRef)

  const windowsOut = useMemo(
    () =>
      workspace.windows.filter(
        (w) => w.presentation !== "panel" && w.state !== "minimized" && isWindowVisible(w, activeId),
      ).length,
    [workspace.windows, activeId],
  )
  const hasThread = thread.messages.length > 0
  const docked = hasThread || windowsOut > 0
  const running = thread.runningTurnId !== null

  useLayoutEffect(() => {
    const el = dockRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setDockHeight(Math.round(el.offsetHeight)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onSubmit = useCallback(
    (input: ComposerSubmit) => {
      void sendPrompt(input).then((sid) => {
        if (sid && sid !== useWindowStore.getState().workspace.active_session_id) return
        if (sid && !window.location.pathname.endsWith(sid)) navigate(osSessionPath(sid))
      })
    },
    [navigate],
  )

  const navOpen = !workspace.nav_collapsed
  const toggleNav = () => (mobile ? setMobileNav((v) => !v) : setNavCollapsed(navOpen))
  const topBtn =
    "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-base font-sans text-ink" data-testid="os-shell">
      <a
        href="#os-prompt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-pill focus:bg-ink focus:px-4 focus:py-2 focus:text-caption focus:font-medium focus:text-on-ink"
      >
        Skip to prompt
      </a>
      <header className="relative z-[80] flex h-12 shrink-0 items-center gap-2 px-2 sm:px-3">
        <button
          type="button"
          onClick={toggleNav}
          className={topBtn}
          aria-label={mobile ? "Open navigation" : navOpen ? "Hide sidebar" : "Show sidebar"}
          aria-expanded={mobile ? mobileNav : navOpen}
          title={`${navOpen ? "Hide" : "Show"} sidebar (⌥\\)`}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            newSession()
            navigate(OS_HOME_PATH)
          }}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Forge home"
        >
          <BrandLogo size="xs" bordered={false} />
          <span className="text-caption font-medium tracking-tight text-ink">Forge</span>
        </button>
        {session && (
          <span className="hidden min-w-0 items-center gap-2 text-caption text-muted sm:flex">
            <span aria-hidden="true" className="text-faint">/</span>
            <span className="truncate" data-testid="os-session-title">{session.title}</span>
          </span>
        )}
        <div className="min-w-0 flex-1" />
        <MinimizedShelf />
        {windowsOut > 1 && !mobile && (
          <button type="button" onClick={tile} className={topBtn} aria-label="Tile windows" title="Tile windows (⌥T)">
            <Columns2 size={15} aria-hidden="true" />
          </button>
        )}
        <DemoBanner variant="pill" />
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden h-8 items-center gap-2 rounded-pill border border-glass-border bg-glass px-3 text-xs text-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:flex"
          aria-label="Search (⌘K)"
        >
          <Search size={13} aria-hidden="true" />
          <span>Search</span>
          <kbd className="font-mono text-2xs text-faint">⌘K</kbd>
        </button>
        <button type="button" onClick={openCommandPalette} className={`${topBtn} sm:hidden`} aria-label="Search">
          <Search size={15} aria-hidden="true" />
        </button>
        <NotificationsBell />
        <AccountMenu />
      </header>

      <div className="relative flex min-h-0 flex-1">
        {navOpen && !mobile && <NavHistoryPanel />}
        {mobile && mobileNav && <NavHistoryPanel overlay onClose={() => setMobileNav(false)} />}

        <main id="os-main" className="relative flex min-w-0 flex-1 flex-col" aria-label="Workspace">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 transition-opacity duration-slow ${docked ? "opacity-0" : "opacity-100"}`}
            style={{
              backgroundImage:
                "radial-gradient(640px 320px at 50% 46%, rgb(var(--primary) / 0.055), transparent 70%)",
            }}
          />
          {hasThread ? (
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <Thread thread={thread} sessionId={activeId} />
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {!docked && (
            <div className="relative mx-auto w-full max-w-[680px] px-4 pb-6 text-center sm:px-6">
              <h1 className="text-headline text-ink sm:text-display">
                {greeting(user?.name)} <span className="text-muted">What should we make?</span>
              </h1>
            </div>
          )}

          <motion.div
            ref={dockRef}
            layout={reduceMotion ? false : "position"}
            transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.9 }}
            className={`relative z-30 mx-auto w-full px-3 sm:px-6 ${docked ? "max-w-[760px] pb-3 pt-2 sm:pb-4" : "max-w-[680px]"}`}
          >
            <Composer
              ref={composerRef}
              variant={docked ? "docked" : "center"}
              running={running}
              onSubmit={onSubmit}
              onStop={() => void cancelActiveTurn()}
            />
            {!docked && (
              <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Suggestions">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => onSubmit({ prompt: s, attachments: [], model: { mode: "auto" } })}
                      className="h-8 rounded-pill border border-border-soft px-3.5 text-caption text-muted transition-colors hover:border-border hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {docked && (
              <p className="mt-1.5 hidden text-center text-2xs text-faint sm:block">
                Forge can open any feature. Press <kbd className="font-mono">⌘K</kbd> to search, <kbd className="font-mono">⌥T</kbd> to tile windows.
              </p>
            )}
          </motion.div>
          {!docked && <div className="flex-[1.35]" />}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ bottom: docked ? dockHeight : 0 }}>
            <WindowManager />
          </div>
        </main>

        <PanelDock />
      </div>

      <CommandPalette
        items={items}
        queryAction={queryAction}
        placeholder="Search capabilities, sessions and actions, or ask Forge"
      />
    </div>
  )
}
