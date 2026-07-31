// Single source of truth for color values that need to be used as raw JS
// strings (inline styles, non-Tailwind-class contexts) rather than Tailwind
// utility classes. Values must stay in sync with tailwind.config.ts's
// `theme.extend.colors` -- do not hand-retype these hex codes elsewhere.

export const COLORS = {
  base: "#09090B",
  ink: "#F4F4F5",
  muted: "#A1A1AA",
  accent: "#D4D4D8",
  ok: "#A1A1AA",
  warn: "#D4D4D8",
  error: "#A1A1AA",
  agentArchitect: "#F4F4F5",
  agentBusinessImprover: "#E4E4E7",
  agentDesigner: "#D4D4D8",
  agentDeveloper: "#A1A1AA",
  agentIntegration: "#71717A",
  agentPm: "#52525B",
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
