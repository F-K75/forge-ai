/**
 * ⌘K inside the OS shell: capabilities from the registry, the session
 * history and window/workspace actions, plus "Ask Forge" for free text.
 */
import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  AppWindow,
  Columns2,
  LayoutDashboard,
  Library,
  LogOut,
  Maximize2,
  MessageSquare,
  Minus,
  PanelLeft,
  Sparkles,
  SquarePen,
  SunMoon,
  X,
} from "lucide-react"
import type { PaletteItem } from "../../lib/commandPalette"
import { cycleTheme, getStoredTheme } from "../../lib/theme"
import { useAuthStore } from "../../store/authStore"
import { useCapabilities } from "./adapters"
import { CATEGORY_ICON, CATEGORY_LABEL } from "./capabilityIcons"
import { OS_HOME_PATH, osSessionPath } from "./osRoutes"
import { newSession, openCapability, openLegacyRoute, sendPrompt } from "./sessionController"
import { useSessionStore } from "./sessionStore"
import { focusedWindow, isWindowVisible, useWindowStore } from "./windowStore"

export const OS_SHORTCUTS = {
  tile: "⌥T",
  close: "⌥W",
  minimize: "⌥M",
  maximize: "⌥↵",
  cycle: "⌥`",
  nav: "⌥\\",
  newSession: "⌥N",
} as const

function shortDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function useOsPaletteItems(): { items: PaletteItem[]; queryAction: (q: string) => PaletteItem } {
  const navigate = useNavigate()
  const { capabilities } = useCapabilities()
  const sessions = useSessionStore((s) => s.sessions)
  const workspace = useWindowStore((s) => s.workspace)
  const logout = useAuthStore((s) => s.logout)

  const items = useMemo<PaletteItem[]>(() => {
    const ws = useWindowStore.getState()
    const top = focusedWindow(workspace)
    const visible = workspace.windows.filter((w) => isWindowVisible(w, workspace.active_session_id))
    const out: PaletteItem[] = []

    out.push({
      id: "os-new-session",
      label: "New session",
      section: "Sessions",
      icon: <SquarePen size={15} />,
      hint: OS_SHORTCUTS.newSession,
      keywords: ["home", "clear", "start", "conversation"],
      run: () => {
        newSession()
        navigate(OS_HOME_PATH)
      },
    })
    for (const s of sessions.filter((x) => !x.archived).slice(0, 8)) {
      out.push({
        id: `os-session-${s.id}`,
        label: s.title || "Untitled session",
        section: "Sessions",
        icon: <MessageSquare size={15} />,
        hint: shortDate(s.updated_at),
        keywords: ["session", "conversation", "history"],
        run: () => navigate(osSessionPath(s.id)),
      })
    }

    for (const w of visible) {
      out.push({
        id: `os-window-${w.id}`,
        label: `Switch to ${w.title}`,
        section: "Windows",
        icon: <AppWindow size={15} />,
        hint: w.state === "minimized" ? "minimized" : w.presentation,
        keywords: ["window", "focus"],
        run: () => ws.focus(w.id),
      })
    }
    if (visible.length > 1) {
      out.push({ id: "os-tile", label: "Tile windows", section: "Windows", icon: <Columns2 size={15} />, hint: OS_SHORTCUTS.tile, keywords: ["arrange", "grid", "split"], run: () => ws.tile() })
    }
    if (top) {
      out.push(
        { id: "os-max", label: `Maximize ${top.title}`, section: "Windows", icon: <Maximize2 size={15} />, hint: OS_SHORTCUTS.maximize, keywords: ["zoom", "fullscreen"], run: () => ws.toggleMaximize(top.id) },
        { id: "os-min", label: `Minimize ${top.title}`, section: "Windows", icon: <Minus size={15} />, hint: OS_SHORTCUTS.minimize, keywords: ["hide"], run: () => ws.minimize(top.id) },
        { id: "os-close", label: `Close ${top.title}`, section: "Windows", icon: <X size={15} />, hint: OS_SHORTCUTS.close, keywords: ["dismiss"], run: () => ws.close(top.id) },
      )
    }
    if (visible.length > 0) {
      out.push({ id: "os-close-all", label: "Close all windows", section: "Windows", icon: <X size={15} />, keywords: ["clear", "reset"], run: () => ws.closeAll() })
    }

    for (const c of capabilities) {
      if (c.status === "hidden") continue
      const Icon = CATEGORY_ICON[c.category]
      out.push({
        id: `os-cap-${c.id}`,
        label: c.title,
        section: "Capabilities",
        icon: <Icon size={15} />,
        hint: CATEGORY_LABEL[c.category],
        keywords: [c.id, c.category, c.summary, ...c.keywords, ...c.legacy_routes],
        run: () => openCapability(c.id),
      })
    }

    out.push(
      { id: "os-library", label: "Capability library", section: "Actions", icon: <Library size={15} />, keywords: ["everything", "features", "browse"], run: () => openCapability("system.capability_library") },
      { id: "os-command-center", label: "Command Center", section: "Actions", icon: <LayoutDashboard size={15} />, keywords: ["dashboard", "fleet", "overview", "home"], run: () => openLegacyRoute("/command", "Command Center") },
      { id: "os-nav", label: workspace.nav_collapsed ? "Show sidebar" : "Hide sidebar", section: "Actions", icon: <PanelLeft size={15} />, hint: OS_SHORTCUTS.nav, keywords: ["nav", "history", "panel"], run: () => ws.setNavCollapsed(!workspace.nav_collapsed) },
      { id: "os-theme", label: "Switch theme", section: "Actions", icon: <SunMoon size={15} />, keywords: ["dark", "light", "appearance", "contrast"], run: () => void cycleTheme(getStoredTheme()) },
      { id: "os-logout", label: "Sign out", section: "Actions", icon: <LogOut size={15} />, keywords: ["logout"], run: () => { void logout(); navigate("/login", { replace: true }) } },
    )
    return out
  }, [capabilities, logout, navigate, sessions, workspace])

  const queryAction = useCallback(
    (q: string): PaletteItem => ({
      id: "os-ask",
      label: `Ask Forge: “${q.length > 60 ? `${q.slice(0, 59)}…` : q}”`,
      section: "Prompt",
      icon: <Sparkles size={15} />,
      hint: "↵",
      run: () => {
        void sendPrompt({ prompt: q }).then((sid) => sid && navigate(osSessionPath(sid)))
      },
    }),
    [navigate],
  )

  return { items, queryAction }
}
