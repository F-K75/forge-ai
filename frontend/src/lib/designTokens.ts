/**
 * Precision Architectural Studio design tokens for Forge AI.
 * Single source of truth for spacing, typography, elevation, motion, radius, and z-index.
 * Colors live as semantic CSS variables in index.css (light / dark / high-contrast).
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const

export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
  48: 48,
  64: 64,
} as const

export type Space = (typeof space)[keyof typeof space]

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const

export const breakpoints = {
  mobile: '<640px',
  tablet: '640px-1024px',
  desktop: '>1024px',
} as const

export const breakpointValues = {
  mobile: 640,
  tablet: 1024,
  desktop: 1280,
} as const

export const layout = {
  maxContent: 1440,
  contentPad: 24,
  contentPadLg: 40,
  navHeight: 56,
  dockHeight: 56,
  radiusXs: 4,
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 14,
  radiusXl: 20,
  radiusFull: 9999,
} as const

export const fontScale = {
  caption: { size: 12, weight: 500, lineHeight: 1.4, tracking: 0.01 },
  label: { size: 12, weight: 600, lineHeight: 1.4, tracking: 0.04 },
  body: { size: 14, weight: 400, lineHeight: 1.55, tracking: 0 },
  section: { size: 14, weight: 600, lineHeight: 1.4, tracking: 0 },
  bodyLg: { size: 16, weight: 400, lineHeight: 1.6, tracking: -0.005 },
  h6: { size: 14, weight: 600, lineHeight: 1.4, tracking: -0.01 },
  h5: { size: 16, weight: 600, lineHeight: 1.35, tracking: -0.015 },
  h4: { size: 18, weight: 600, lineHeight: 1.3, tracking: -0.015 },
  h3: { size: 20, weight: 600, lineHeight: 1.25, tracking: -0.02 },
  h2: { size: 28, weight: 600, lineHeight: 1.2, tracking: -0.025 },
  h1: { size: 42, weight: 700, lineHeight: 1.08, tracking: -0.03 },
  display: { size: 56, weight: 700, lineHeight: 1.04, tracking: -0.035 },
} as const

export const typeScale = {
  hero: { size: 68, weight: 700, tracking: -0.035, lineHeight: 1.02 },
  display: { size: 52, weight: 700, tracking: -0.03, lineHeight: 1.06 },
  headline: { size: 34, weight: 600, tracking: -0.025, lineHeight: 1.15 },
  title: { size: 22, weight: 600, tracking: -0.02, lineHeight: 1.25 },
  body: { size: 15, weight: 400, tracking: 0, lineHeight: 1.55 },
  label: { size: 13, weight: 600, tracking: 0.01, lineHeight: 1.35 },
  caption: { size: 12, weight: 500, tracking: 0.01, lineHeight: 1.35 },
  h1: { size: 42, weight: 700, tracking: -0.03, lineHeight: 1.08 },
  h2: { size: 28, weight: 600, tracking: -0.025, lineHeight: 1.2 },
  h3: { size: 20, weight: 600, tracking: -0.02, lineHeight: 1.25 },
  h4: { size: 18, weight: 600, tracking: -0.015, lineHeight: 1.3 },
  h5: { size: 16, weight: 600, tracking: -0.015, lineHeight: 1.35 },
  h6: { size: 14, weight: 600, tracking: -0.01, lineHeight: 1.4 },
  bodyLg: { size: 16, weight: 400, tracking: -0.005, lineHeight: 1.6 },
  section: { size: 14, weight: 600, tracking: 0, lineHeight: 1.4 },
} as const

export const fontSize = {
  caption: fontScale.caption.size,
  label: fontScale.label.size,
  body: fontScale.body.size,
  section: fontScale.section.size,
  bodyLg: fontScale.bodyLg.size,
  h6: fontScale.h6.size,
  h5: fontScale.h5.size,
  h4: fontScale.h4.size,
  h3: fontScale.h3.size,
  h2: fontScale.h2.size,
  h1: fontScale.h1.size,
  display: fontScale.display.size,
} as const

export const motion = {
  duration: {
    instant: 100,
    fast: 150,
    normal: 220,
    slow: 300,
    story: 420,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: { type: 'spring' as const, stiffness: 360, damping: 32 },
    softSpring: { type: 'spring' as const, stiffness: 260, damping: 28 },
    apple: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    material: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const

export const elevation = {
  0: 'none',
  1: '0 1px 2px rgba(15, 23, 42, 0.05)',
  2: '0 4px 12px -2px rgba(15, 23, 42, 0.07), 0 1px 3px rgba(15, 23, 42, 0.04)',
  3: '0 12px 28px -6px rgba(15, 23, 42, 0.10), 0 4px 10px -2px rgba(15, 23, 42, 0.04)',
  4: '0 20px 44px -8px rgba(15, 23, 42, 0.14), 0 6px 14px -4px rgba(15, 23, 42, 0.06)',
  5: '0 28px 64px -12px rgba(15, 23, 42, 0.22)',
} as const

export const zIndex = {
  base: 0,
  sticky: 20,
  dock: 40,
  nav: 50,
  dropdown: 60,
  modal: 70,
  toast: 80,
  command: 90,
} as const

export type ThemeMode = 'dark' | 'light' | 'high-contrast'

export const THEME_STORAGE_KEY = 'forge-theme-mode'

export const colorTokens = {
  background: {
    base: 'rgb(var(--bg))',
    elevated: 'rgb(var(--surface))',
    card: 'rgb(var(--surface-container))',
    cardHigh: 'rgb(var(--surface-container-high))',
    glass: 'var(--glass)',
    glassStrong: 'var(--glass-strong)',
  },
  accent: {
    default: 'rgb(var(--primary))',
    hover: 'rgb(var(--primary-hover))',
    soft: 'var(--primary-container)',
  },
  text: {
    primary: 'rgb(var(--on-surface))',
    secondary: 'rgb(var(--on-surface-variant))',
    muted: 'rgb(var(--outline-muted))',
  },
  border: {
    default: 'rgb(var(--outline) / var(--outline-alpha))',
    soft: 'rgb(var(--outline) / var(--outline-soft-alpha))',
  },
  status: {
    success: 'rgb(var(--success))',
    warning: 'rgb(var(--warning))',
    error: 'rgb(var(--error))',
    info: 'rgb(var(--info))',
  },
  semantic: {
    success: 'rgb(var(--success))',
    warning: 'rgb(var(--warning))',
    error: 'rgb(var(--error))',
    info: 'rgb(var(--info))',
  },
  neutral: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#090C12',
  },
  state: {
    hover: 'var(--state-hover)',
    pressed: 'var(--state-pressed)',
    focus: 'var(--state-focus)',
  },
} as const
