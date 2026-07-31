// Single source of truth for color values used as raw JS strings.
// Keep in sync with tailwind.config.ts.

export const COLORS = {
  base: "#F5F5F7",
  ink: "#1D1D1F",
  muted: "#6E6E73",
  accent: "#0071E3",
  ok: "#30D158",
  warn: "#FF9F0A",
  error: "#FF453A",
  agentArchitect: "#0071E3",
  agentBusinessImprover: "#5E5CE6",
  agentDesigner: "#BF5AF2",
  agentDeveloper: "#30D158",
  agentIntegration: "#64D2FF",
  agentPm: "#FF9F0A",
} as const

export const HUE_CYCLE = [
  COLORS.agentArchitect,
  COLORS.agentDesigner,
  COLORS.agentDeveloper,
  COLORS.agentIntegration,
  COLORS.agentPm,
  COLORS.agentBusinessImprover,
] as const
