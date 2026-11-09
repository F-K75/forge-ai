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
  64: 64,
} as const

export type Space = (typeof space)[keyof typeof space]

export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
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
  navHeight: 64,
  dockHeight: 64,
  radiusXs: 4,
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 28,
  radiusFull: 9999,
} as const

export const fontScale = {
  caption: { size: 12, weight: 400, lineHeight: 1.4, tracking: 0.01 },
  label: { size: 12, weight: 500, lineHeight: 1.4, tracking: 0.01 },
  body: { size: 14, weight: 400, lineHeight: 1.5, tracking: 0 },
  section: { size: 14, weight: 600, lineHeight: 1.4, tracking: 0 },
  bodyLg: { size: 16, weight: 400, lineHeight: 1.5, tracking: -0.01 },
  h6: { size: 14, weight: 600, lineHeight: 1.4, tracking: 0 },
  h5: { size: 16, weight: 600, lineHeight: 1.35, tracking: -0.01 },
  h4: { size: 18, weight: 600, lineHeight: 1.35, tracking: -0.015 },
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
  h4: { size: 18, weight: 600, tracking: -0.015, lineHeight: 1.35 },
  h5: { size: 16, weight: 600, tracking: -0.01, lineHeight: 1.35 },
  h6: { size: 14, weight: 600, tracking: 0, lineHeight: 1.4 },
  bodyLg: { size: 16, weight: 400, tracking: -0.01, lineHeight: 1.5 },
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
  1: '0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)',
  2: '0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.30)',
  3: '0px 1px 3px 0px rgba(0, 0, 0, 0.30), 0px 4px 8px 3px rgba(0, 0, 0, 0.15)',
  4: '0px 2px 3px 0px rgba(0, 0, 0, 0.30), 0px 6px 10px 4px rgba(0, 0, 0, 0.15)',
  5: '0px 4px 4px 0px rgba(0, 0, 0, 0.30), 0px 8px 12px 6px rgba(0, 0, 0, 0.15)',
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
  semantic: {
    success: 'rgb(var(--success))',
    warning: 'rgb(var(--warning))',
    error: 'rgb(var(--error))',
    info: 'rgb(var(--info))',
  },
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#030712',
  },
  state: {
    hover: 'var(--state-hover)',
    pressed: 'var(--state-pressed)',
    focus: 'var(--state-focus)',
  },
} as const
