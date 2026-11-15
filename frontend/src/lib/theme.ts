import { THEME_STORAGE_KEY, type ThemeMode } from './designTokens'

export type { ThemeMode }

// Single source of truth for color values used as raw JS strings.
// Dark-first Developer Workspace palette (Linear/Vercel minimal style)
export const COLORS = {
  base: "#09090B",
  surface: "#111114",
  elevated: "#18181B",
  ink: "#FAFAFA",
  muted: "#A1A1AA",
  accent: "#14B8A6",
  ok: "#10B981",
  warn: "#F59E0B",
  error: "#EF4444",
  info: "#06B6D4",
  agentArchitect: "#38BDF8",
  agentBusinessImprover: "#A855F7",
  agentDesigner: "#F43F5E",
  agentDeveloper: "#10B981",
  agentIntegration: "#06B6D4",
  agentPm: "#14B8A6",
} as const

export const HUE_CYCLE = [
  COLORS.agentArchitect,
  COLORS.agentDesigner,
  COLORS.agentDeveloper,
  COLORS.agentIntegration,
  COLORS.agentPm,
  COLORS.agentBusinessImprover,
] as const

const ROOT_CLASSES = ['dark', 'light', 'hc', 'high-contrast'] as const

function clearThemeClasses(root: HTMLElement) {
  root.classList.remove(...ROOT_CLASSES)
}

/** Apply theme to <html>. Dark-first Developer Workspace is the default. */
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  clearThemeClasses(root)
  if (mode === 'light') {
    root.classList.add('light')
    root.style.colorScheme = 'light'
  } else if (mode === 'high-contrast') {
    root.classList.add('dark', 'hc', 'high-contrast')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.add('dark')
    root.style.colorScheme = 'dark'
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'high-contrast' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function initTheme() {
  applyTheme(getStoredTheme())
}

export function cycleTheme(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ['dark', 'light', 'high-contrast']
  const next = order[(order.indexOf(current) + 1) % order.length]!
  applyTheme(next)
  return next
}
