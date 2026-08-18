/**
 * Apple × Google Material 3 design tokens for Forge AI.
 * Single source of truth for spacing, typography, elevation, motion, radius, and z-index.
 * Colors live as CSS variables in index.css (light / dark / high-contrast).
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
} as const

export type Space = (typeof space)[keyof typeof space]

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  full: 9999,
} as const

export const layout = {
  maxContent: 1440,
  contentPad: 24,
  contentPadLg: 40,
  navHeight: 56,
  dockHeight: 64,
  radiusXs: 8,
  radiusSm: 12,
  radiusMd: 16,
  radiusLg: 20,
  radiusXl: 28,
  radiusFull: 9999,
} as const

export const fontScale = {
  label: { size: 12, weight: 500, lineHeight: 1.4, tracking: 0.01 },
  body: { size: 14, weight: 400, lineHeight: 1.5, tracking: 0 },
  section: { size: 14, weight: 600, lineHeight: 1.4, tracking: 0 },
  bodyLg: { size: 16, weight: 400, lineHeight: 1.5, tracking: -0.01 },
  h3: { size: 20, weight: 600, lineHeight: 1.3, tracking: -0.02 },
  h2: { size: 24, weight: 600, lineHeight: 1.25, tracking: -0.02 },
  h1: { size: 40, weight: 700, lineHeight: 1.05, tracking: -0.03 },
  display: { size: 40, weight: 700, lineHeight: 1.05, tracking: -0.03 },
} as const

export const typeScale = {
  hero: { size: 80, weight: 700, tracking: -0.04, lineHeight: 1.02 },
  display: { size: 56, weight: 700, tracking: -0.035, lineHeight: 1.05 },
  headline: { size: 34, weight: 600, tracking: -0.025, lineHeight: 1.15 },
  title: { size: 22, weight: 600, tracking: -0.015, lineHeight: 1.25 },
  body: { size: 17, weight: 400, tracking: -0.01, lineHeight: 1.47 },
  label: { size: 14, weight: 500, tracking: -0.01, lineHeight: 1.35 },
  caption: { size: 12, weight: 500, tracking: 0.01, lineHeight: 1.35 },
  h1: { size: 40, weight: 700, tracking: -0.03, lineHeight: 1.05 },
  h2: { size: 24, weight: 600, tracking: -0.02, lineHeight: 1.25 },
  h3: { size: 20, weight: 600, tracking: -0.02, lineHeight: 1.3 },
  bodyLg: { size: 16, weight: 400, tracking: -0.01, lineHeight: 1.5 },
  section: { size: 14, weight: 600, tracking: 0, lineHeight: 1.4 },
} as const

export const fontSize = {
  label: fontScale.label.size,
  body: fontScale.body.size,
  section: fontScale.section.size,
  bodyLg: fontScale.bodyLg.size,
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
    slow: 320,
    story: 480,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: { type: 'spring' as const, stiffness: 380, damping: 32 },
    softSpring: { type: 'spring' as const, stiffness: 260, damping: 28 },
    apple: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    material: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const

export const elevation = {
  0: 'none',
  1: '0 1px 2px rgb(0 0 0 / 0.24), 0 1px 3px rgb(0 0 0 / 0.16)',
  2: '0 2px 6px rgb(0 0 0 / 0.28), 0 1px 2px rgb(0 0 0 / 0.2)',
  3: '0 4px 12px rgb(0 0 0 / 0.32), 0 2px 4px rgb(0 0 0 / 0.2)',
  4: '0 8px 24px rgb(0 0 0 / 0.36), 0 4px 8px rgb(0 0 0 / 0.22)',
  5: '0 16px 40px rgb(0 0 0 / 0.42), 0 8px 16px rgb(0 0 0 / 0.24)',
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
    base: 'var(--bg)',
    elevated: 'var(--surface)',
    card: 'var(--surface-container)',
    cardHigh: 'var(--surface-container-high)',
    glass: 'var(--glass)',
    glassStrong: 'var(--glass-strong)',
  },
  accent: {
    default: 'rgb(var(--primary))',
    hover: 'rgb(var(--primary-hover))',
    soft: 'var(--primary-container)',
  },
  text: {
    primary: 'var(--on-surface)',
    secondary: 'var(--on-surface-variant)',
    muted: 'var(--outline-muted)',
  },
  border: {
    default: 'var(--outline)',
    soft: 'var(--outline)',
  },
  status: {
    success: 'rgb(var(--success))',
    warning: 'rgb(var(--warning))',
    error: 'rgb(var(--error))',
    info: 'rgb(var(--info))',
  },
  state: {
    hover: 'var(--state-hover)',
    pressed: 'var(--state-pressed)',
    focus: 'var(--state-focus)',
  },
} as const
