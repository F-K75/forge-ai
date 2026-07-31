// Single source of truth for color values used as raw JS strings.
// Keep in sync with index.css dark-first tokens.

export const COLORS = {
  base: "#000000",
  ink: "#F5F5F7",
  muted: "#A1A1A6",
  accent: "#0A84FF",
  ok: "#30D158",
  warn: "#FF9F0A",
  error: "#FF453A",
  agentArchitect: "#0A84FF",
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
