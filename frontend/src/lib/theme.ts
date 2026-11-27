import { THEME_STORAGE_KEY, type ThemeMode } from './designTokens'

export type { ThemeMode }

// Single source of truth for semantic color values used as raw JS strings (charts, Three.js, canvas).
export const COLORS = {
  base: '#070707',
  ink: '#FFFFFF',
  muted: '#A8A8A8',
  accent: '#FF6600',
  ok: '#34C778',
  warn: '#F5A623',
  error: '#F45050',
  faint: '#828282',
  panel: '#111111',
  panelAlt: '#181818',
  hairline: 'rgba(255,255,255,0.12)',
  info: '#60A5FA',
  // Agent role hues: restrained and harmonious on the Ember Night canvas
  agentArchitect: '#7FA6D9',
  agentBusinessImprover: '#A59AD6',
  agentDesigner: '#D08FB4',
  agentDeveloper: '#6FC196',
  agentIntegration: '#6FBFC4',
  agentPm: '#E0A15C',
  // Atmospheric gradient stops (olive / rust / teal)
  atmosOlive: '#6E6E4D',
  atmosRust: '#613020',
  atmosTeal: '#3D5757',
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

/** Apply theme to <html>. Ember Night (dark) is the default; light is opt-in. */
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
