// Ordered categorical palette for series without an existing semantic token.
// `ok`/`warn`/`error` (tailwind.config.ts) are reserved for pass/fail/status
// encoding and intentionally excluded here so status and identity never share a hue.
export const CATEGORICAL_PALETTE = [
  "#7C5CFF", // accent
  "#38BDF8",
  "#F472B6",
  "#FBBF24",
  "#4ADE80",
  "#A78BFA",
  "#FB923C",
] as const

export const colorForIndex = (i: number): string =>
  CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]

// Mirrors the agent-* tokens in tailwind.config.ts, keyed by the backend's
// AgentType enum values (backend/core/models.py) rather than the Tailwind
// class suffix (which uses hyphens instead of underscores).
export const AGENT_COLORS: Record<string, string> = {
  architect: "#F4A261",
  designer: "#E8823C",
  developer: "#D9722C",
  integration: "#C2631F",
  pm: "#A85423",
  business_improver: "#F0934D",
}

export const colorForAgent = (agent: string, fallbackIndex: number): string =>
  AGENT_COLORS[agent] ?? colorForIndex(fallbackIndex)
