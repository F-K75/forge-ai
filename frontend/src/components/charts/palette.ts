// Ordered categorical palette — greyscale series for charts.
export const CATEGORICAL_PALETTE = [
  "#F4F4F5",
  "#E4E4E7",
  "#D4D4D8",
  "#A1A1AA",
  "#71717A",
  "#52525B",
  "#3F3F46",
] as const

export const colorForIndex = (i: number): string =>
  CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]

export const AGENT_COLORS: Record<string, string> = {
  architect: "#F4F4F5",
  designer: "#D4D4D8",
  developer: "#A1A1AA",
  integration: "#71717A",
  pm: "#52525B",
  business_improver: "#E4E4E7",
}

export const colorForAgent = (agent: string, fallbackIndex: number): string =>
  AGENT_COLORS[agent] ?? colorForIndex(fallbackIndex)
