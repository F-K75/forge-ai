import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts"
import { motion, useReducedMotion } from "motion/react"
import { motionVariants } from "../lib/animations"
import { presets } from "../lib/animationPresets"
import { optimizerApi, budgetsApi } from "../lib/api"
import BrandLogo from "../components/BrandLogo"
import { ChartContainer } from "../components/charts/ChartContainer"
import { ChartTooltip } from "../components/charts/ChartTooltip"
import { colorForAgent, colorForIndex } from "../components/charts/palette"

const AXIS_COLOR = "#64748b" // slate-500, matches this page's slate palette
const GRID_COLOR = "#1e293b" // slate-800

interface BreakdownEntry {
  provider?: string
  agent?: string
  project_id?: string
  prompt_tokens: number
  completion_tokens: number
  cached_tokens: number
  cost_usd: number
  requests: number
}

interface CostBreakdown {
  days: number
  by_provider: BreakdownEntry[]
  by_agent: BreakdownEntry[]
  by_project: BreakdownEntry[]
  cache_savings: {
    prompt_cache_hits: number
    prompt_cache_misses: number
    response_cache_hits: number
    response_cache_misses: number
    semantic_response_cache_hits: number
    saved_latency_ms: number
    saved_tokens: number
  }
  optimization_savings: {
    total_requests: number
    total_tokens_used: number
    total_tokens_saved: number
    average_compression_ratio: number
    cache_hit_ratio: number
    cost_by_provider: Record<string, number>
    cost_by_model: Record<string, number>
  }
}

interface BudgetLimit {
  scope: string
  scope_id: string
  soft_limit_usd: number | null
  hard_limit_usd: number | null
  period: "daily" | "monthly"
}

interface SpendingEntry {
  user_id: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost_usd: number
  requests: number
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      className="rounded-lg border border-slate-800 bg-slate-900/70 p-4"
      {...presets.card}
      variants={motionVariants.staggerItem}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl text-slate-100">{value}</p>
    </motion.div>
  )
}

function BreakdownTable({
  title,
  keyLabel,
  rows,
  keyField,
}: {
  title: string
  keyLabel: string
  keyField: "provider" | "agent" | "project_id"
  rows: BreakdownEntry[]
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      <div className="mt-2 max-h-64 overflow-auto rounded border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="p-2">{keyLabel}</th>
              <th className="p-2">Requests</th>
              <th className="p-2">Prompt tokens</th>
              <th className="p-2">Completion tokens</th>
              <th className="p-2">Cost (USD)</th>
            </tr>
          </thead>
          <motion.tbody
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            {rows.length === 0 && (
              <tr>
                 <td colSpan={5} className="p-2 text-slate-500">
                  No data available for this window.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => (
              <motion.tr key={idx} className="border-t border-slate-800" variants={motionVariants.staggerItem}>
                <td className="p-2">{row[keyField] ?? "—"}</td>
                <td className="p-2">{row.requests}</td>
                <td className="p-2">{row.prompt_tokens}</td>
                <td className="p-2">{row.completion_tokens}</td>
                <td className="p-2">{row.cost_usd.toFixed(4)}</td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  )
}

function BreakdownBarChart({
  rows,
  keyField,
  colorFor,
}: {
  rows: BreakdownEntry[]
  keyField: "provider" | "agent"
  colorFor: (key: string, index: number) => string
}) {
  const data = rows.map((r) => ({ key: r[keyField] ?? "—", cost_usd: r.cost_usd }))
  if (data.length === 0) return null

  return (
    <ChartContainer height={Math.max(120, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          stroke={AXIS_COLOR}
          fontSize={10}
          tickFormatter={(v) => `$${v}`}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="key"
          stroke={AXIS_COLOR}
          fontSize={10}
          width={110}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip formatter={(v) => [`$${v.toFixed(4)}`, "Cost"]} />} />
        <Bar dataKey="cost_usd" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={d.key} fill={colorFor(d.key, i)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export default function OptimizationDashboard() {
  const reduceMotion = useReducedMotion()
  const [days, setDays] = useState(30)
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null)
  const [limits, setLimits] = useState<BudgetLimit[]>([])
  const [spending, setSpending] = useState<SpendingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [scope, setScope] = useState<"org" | "project" | "agent">("org")
  const [scopeId, setScopeId] = useState("")
  const [softLimit, setSoftLimit] = useState("")
  const [hardLimit, setHardLimit] = useState("")
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([optimizerApi.costBreakdown(days), budgetsApi.list(), budgetsApi.spending(days)])
      .then(([breakdownPayload, limitsPayload, spendingPayload]) => {
        setBreakdown(breakdownPayload)
        setLimits(limitsPayload.limits || [])
        setSpending(spendingPayload.users || [])
      })
      .catch(() => setError("Unable to load optimization data"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const saveLimit = async () => {
    if (!scopeId.trim()) {
      setSaveStatus("Scope ID is required")
      return
    }
    setSaveStatus("Saving")
    try {
      await budgetsApi.set(scope, scopeId.trim(), {
        soft_limit_usd: softLimit ? parseFloat(softLimit) : null,
        hard_limit_usd: hardLimit ? parseFloat(hardLimit) : null,
      })
      setSaveStatus("Saved")
      load()
    } catch {
      setSaveStatus("Unable to save")
    }
  }

  const removeLimit = async (l: BudgetLimit) => {
    await budgetsApi.remove(l.scope, l.scope_id)
    load()
  }

  const totalCost = spending.reduce((sum, s) => sum + s.cost_usd, 0)
  const cache = breakdown?.cache_savings
  const responseCacheHitRatio =
    cache && cache.response_cache_hits + cache.response_cache_misses > 0
      ? cache.response_cache_hits / (cache.response_cache_hits + cache.response_cache_misses)
      : 0
  const semanticShare =
    cache && cache.response_cache_hits > 0
      ? cache.semantic_response_cache_hits / cache.response_cache_hits
      : 0

  return (
    <motion.div
      className="p-8 text-sm text-slate-200"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3">
        <BrandLogo size="md" />
        <h1 className="text-2xl font-semibold">AI optimization</h1>
      </div>
      <p className="mt-2 text-slate-400">
        Monitor spend, cache performance, and optimization across the AI Gateway.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Window
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="rounded bg-slate-800 px-2 py-1 text-slate-200"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {loading ? (
         <p className="mt-6">Loading</p>
      ) : error ? (
        <p className="mt-6 text-rose-300">{error}</p>
      ) : (
        <>
          <motion.section
            className="mt-6 grid gap-4 md:grid-cols-4"
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            <StatCard label="Total spend" value={`$${totalCost.toFixed(4)}`} />
            <StatCard
              label="Response cache hit rate"
              value={`${(responseCacheHitRatio * 100).toFixed(1)}%`}
            />
            <StatCard label="Semantic cache share" value={`${(semanticShare * 100).toFixed(1)}%`} />
            <StatCard
              label="Average compression ratio"
              value={
                breakdown
                  ? breakdown.optimization_savings.average_compression_ratio.toFixed(3)
                  : "—"
              }
            />
          </motion.section>

          <motion.section
            className="mt-8"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          >
            <h2 className="text-lg font-medium">Cost breakdown</h2>
            {breakdown && (
              <>
                <BreakdownBarChart
                  rows={breakdown.by_provider}
                  keyField="provider"
                  colorFor={(_, i) => colorForIndex(i)}
                />
                <BreakdownTable
                  title="By provider"
                  keyLabel="Provider"
                  keyField="provider"
                  rows={breakdown.by_provider}
                />
                <BreakdownBarChart
                  rows={breakdown.by_agent}
                  keyField="agent"
                  colorFor={(key, i) => colorForAgent(key, i)}
                />
                <BreakdownTable
                  title="By agent"
                  keyLabel="Agent"
                  keyField="agent"
                  rows={breakdown.by_agent}
                />
                <BreakdownTable
                  title="By project"
                  keyLabel="Project"
                  keyField="project_id"
                  rows={breakdown.by_project}
                />
              </>
            )}
          </motion.section>

          <motion.section
            className="mt-8"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
          >
            <h2 className="text-lg font-medium">Per-user spend</h2>
            <div className="mt-3 max-h-64 overflow-auto rounded border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2">User</th>
                    <th className="p-2">Requests</th>
                    <th className="p-2">Total tokens</th>
                    <th className="p-2">Cost (USD)</th>
                  </tr>
                </thead>
                <motion.tbody
                  variants={reduceMotion ? undefined : motionVariants.staggerContainer}
                  initial={reduceMotion ? false : "hidden"}
                  animate="visible"
                >
                  {spending.map((s) => (
                    <motion.tr key={s.user_id} className="border-t border-slate-800" variants={motionVariants.staggerItem}>
                      <td className="p-2">{s.user_id}</td>
                      <td className="p-2">{s.requests}</td>
                      <td className="p-2">{s.total_tokens}</td>
                      <td className="p-2">{s.cost_usd.toFixed(4)}</td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          </motion.section>

          <motion.section
            className="mt-8"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
          >
            <h2 className="text-lg font-medium">Budget limits</h2>
            <div className="mt-3 max-h-64 overflow-auto rounded border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-2">Scope</th>
                    <th className="p-2">Scope ID</th>
                    <th className="p-2">Period</th>
                    <th className="p-2">Soft limit</th>
                    <th className="p-2">Hard limit</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <motion.tbody
                  variants={reduceMotion ? undefined : motionVariants.staggerContainer}
                  initial={reduceMotion ? false : "hidden"}
                  animate="visible"
                >
                  {limits.length === 0 && (
                    <tr>
                       <td colSpan={6} className="p-2 text-slate-500">
                        No budget limits configured yet.
                      </td>
                    </tr>
                  )}
                  {limits.map((l) => (
                    <motion.tr key={`${l.scope}-${l.scope_id}`} className="border-t border-slate-800" variants={motionVariants.staggerItem}>
                      <td className="p-2">{l.scope}</td>
                      <td className="p-2">{l.scope_id}</td>
                      <td className="p-2">{l.period}</td>
                      <td className="p-2">{l.soft_limit_usd ?? "—"}</td>
                      <td className="p-2">{l.hard_limit_usd ?? "—"}</td>
                      <td className="p-2">
                        <button
                          onClick={() => removeLimit(l)}
                          className="rounded bg-slate-800 px-2 py-1 hover:bg-rose-900/60"
                        >
                          Remove
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Scope</span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                  className="rounded bg-slate-800 px-2 py-1"
                >
                  <option value="org">org</option>
                  <option value="project">project</option>
                  <option value="agent">agent</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Scope ID</span>
                <input
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1"
                  placeholder="org-123"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Soft limit (USD)</span>
                <input
                  value={softLimit}
                  onChange={(e) => setSoftLimit(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1"
                  placeholder="optional"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Hard limit (USD)</span>
                <input
                  value={hardLimit}
                  onChange={(e) => setHardLimit(e.target.value)}
                  className="rounded bg-slate-800 px-2 py-1"
                  placeholder="optional"
                />
              </label>
              <motion.button
                onClick={saveLimit}
                className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500"
                {...presets.button}
              >
                Save limit
              </motion.button>
            </div>
            {saveStatus && <p className="mt-3 text-xs text-slate-400">{saveStatus}</p>}
          </motion.section>
        </>
      )}
    </motion.div>
  )
}
