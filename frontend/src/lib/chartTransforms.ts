interface AiUsageRow {
  date: string
  model: string
  cost_usd: number
}

export interface PivotedAiUsage {
  rows: Array<Record<string, number | string>>
  models: string[]
}

/**
 * AIUsageMetrics comes back as one row per (date, model) pair. A stacked
 * area chart needs one row per date with a numeric key per model, so this
 * pivots the rows and orders models by total cost (highest first) for
 * consistent stacking/legend order.
 */
export function pivotAiUsageByDate(rows: AiUsageRow[]): PivotedAiUsage {
  const totalsByModel = new Map<string, number>()
  const byDate = new Map<string, Record<string, number | string>>()

  for (const row of rows) {
    totalsByModel.set(row.model, (totalsByModel.get(row.model) ?? 0) + row.cost_usd)

    const existing = byDate.get(row.date) ?? { date: row.date }
    existing[row.model] = (Number(existing[row.model]) || 0) + row.cost_usd
    byDate.set(row.date, existing)
  }

  const models = [...totalsByModel.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model)

  const sortedRows = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  )

  return { rows: sortedRows, models }
}
