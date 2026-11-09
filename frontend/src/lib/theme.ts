import { THEME_STORAGE_KEY, type ThemeMode } from './designTokens'

export type { ThemeMode }

// Single source of truth for color values used as raw JS strings.
// Neubrutalism palette
export const COLORS = {
  base: "#F4F0EA",
  ink: "#0A0A0A",
  muted: "#4A4A4A",
  accent: "#14B8A6",
  ok: "#00F59B",
  warn: "#FF8A00",
  error: "#FF5376",
  agentArchitect: "#00F0FF",
  agentBusinessImprover: "#A855F7",
  agentDesigner: "#FF5376",
  agentDeveloper: "#00F59B",
  agentIntegration: "#00F0FF",
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

/** Apply theme to <html>. Light/cream is the Neubrutalism default. */
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  clearThemeClasses(root)
  if (mode === 'dark') {
    root.classList.add('dark')
  } else if (mode === 'high-contrast') {
    root.classList.add('dark', 'hc', 'high-contrast')
  } else {
    root.classList.add('light')
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
  return 'light'
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
