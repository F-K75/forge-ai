import { THEME_STORAGE_KEY, type ThemeMode } from './designTokens'

export type { ThemeMode }

// Single source of truth for semantic color values used as raw JS strings (charts, Three.js, canvas).
export const COLORS = {
  base: '#F8FAFC',
  ink: '#0F172A',
  muted: '#475569',
  accent: '#2563EB',
  ok: '#059669',
  warn: '#D97706',
  error: '#DC2626',
  agentArchitect: '#2563EB',
  agentBusinessImprover: '#6366F1',
  agentDesigner: '#8B5CF6',
  agentDeveloper: '#059669',
  agentIntegration: '#0284C7',
  agentPm: '#D97706',
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

/** Apply theme to <html>. Clean cool alabaster light mode is default. */
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
