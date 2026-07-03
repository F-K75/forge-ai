// Single source of truth for color values that need to be used as raw JS
// strings (inline styles, non-Tailwind-class contexts) rather than Tailwind
// utility classes. Values must stay in sync with tailwind.config.ts's
// `theme.extend.colors` -- do not hand-retype these hex codes elsewhere.

export const COLORS = {
  base: "#0A0A0F",
  ink: "#E8E8F0",
  muted: "#8B8B9E",
  accent: "#7C5CFF",
  ok: "#34D399",
  warn: "#F59E0B",
  error: "#EF4444",
  agentArchitect: "#6366F1",
  agentBusinessImprover: "#EC4899",
  agentDesigner: "#A855F7",
  agentDeveloper: "#22D3EE",
  agentIntegration: "#F59E0B",
  agentPm: "#34D399",
} as const

// Stable per-item accent for cards with no backend-provided color field
// (e.g. marketplace listings) -- order matches the agent-* palette above.
export const HUE_CYCLE = [
  COLORS.agentArchitect,
  COLORS.agentDesigner,
  COLORS.agentDeveloper,
  COLORS.agentIntegration,
  COLORS.agentPm,
  COLORS.agentBusinessImprover,
] as const
