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
  architect: "#6366F1",
  designer: "#A855F7",
  developer: "#22D3EE",
  integration: "#F59E0B",
  pm: "#34D399",
  business_improver: "#EC4899",
}

export const colorForAgent = (agent: string, fallbackIndex: number): string =>
  AGENT_COLORS[agent] ?? colorForIndex(fallbackIndex)
