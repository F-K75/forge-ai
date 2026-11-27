import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts"
import { motion, useReducedMotion } from "motion/react"
import { motionVariants } from "../lib/animations"
import { presets } from "../lib/animationPresets"
import { adminApi } from "../lib/api"
import { LIVE_MODE } from "../lib/env"
import BrandLogo from "../components/BrandLogo"
import { ChartContainer } from "../components/charts/ChartContainer"
import { ChartTooltip } from "../components/charts/ChartTooltip"
import { colorForIndex } from "../components/charts/palette"

const AXIS_COLOR = "#5A5A6B" // tailwind.config.ts `faint`
const GRID_COLOR = "#22222E" // tailwind.config.ts `border`

interface DimensionScore {
  value: number
  weight?: number
  weighted_contribution?: number
  description?: string
  trend?: string
  [key: string]: unknown
}

interface PriorityBucket {
  total: number
  completed: number
  remaining: number
}

// This mirrors orchestration/{METRICS,DASHBOARD_DATA,BENCHMARK_REPORT}.json —
// external, orchestration-owned snapshot data, not an internal API contract,
// so fields are optional/loosely typed rather than a strict schema.
interface EngineeringHealthResponse {
  available: boolean
  metrics: {
    metrics?: Record<string, { value: number; description?: string; unit?: string }>
    trends?: Record<string, Array<{ timestamp: string; value: number }>>
  } | null
  dashboard: {
    overall_score: { value: number; description?: string; scale?: string }
    scores: Record<string, DimensionScore>
    task_progress: {
      total: number
      completed: number
      completion_percentage: number
      by_priority: Record<string, PriorityBucket>
    }
    sprint_progress?: { current_sprint?: string }
    recent_activity: Array<{ timestamp: string; event: string; detail?: string }>
    alerts: Array<{ severity: "critical" | "warning" | "info"; message: string; category?: string }>
  } | null
  benchmark: {
    current_certification_status?: {
      level_name?: string
      evidence_completeness?: string
    }
  } | null
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "text-error",
  warning: "text-warn",
  info: "text-muted",
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <motion.div className="bg-base p-4" {...presets.card} variants={motionVariants.staggerItem}>
      <p className="font-mono text-[1.4rem] font-medium text-ink leading-none mb-1">{value}</p>
      <p className="text-xs text-faint">{label}</p>
    </motion.div>
  )
}

export default function EngineeringHealthPage() {
  const reduceMotion = useReducedMotion()
  const { data, isLoading } = useQuery<EngineeringHealthResponse>({
    queryKey: ["admin-engineering-health"],
    queryFn: () => adminApi.engineeringHealth(),
    enabled: LIVE_MODE,
  })

  const scoreRows = useMemo(() => {
    const scores = data?.dashboard?.scores
    if (!scores) return []
    return Object.entries(scores)
      .map(([dimension, s]) => ({ dimension, value: s.value }))
      .sort((a, b) => a.value - b.value)
  }, [data])

  const priorityRows = useMemo(() => {
    const byPriority = data?.dashboard?.task_progress?.by_priority
    if (!byPriority) return []
    return Object.entries(byPriority).map(([priority, b]) => ({
      priority,
      completed: b.completed,
      remaining: b.remaining,
    }))
  }, [data])

  return (
    <motion.div
      className="px-6 md:px-10 py-8 md:py-10 max-w-7xl mx-auto bg-base text-ink"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
        <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
        Admin
      </div>
      <header className="flex items-center gap-3 mb-10">
        <BrandLogo size="md" />
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">
          Engineering health
        </h1>
      </header>

      {!LIVE_MODE && (
        <div className="mb-9 bg-warn/10 border border-warn/30 text-warn px-4 py-3 rounded-lg text-sm">
          Demo mode — connect a backend to view live data.
        </div>
      )}

      {LIVE_MODE && isLoading && <p className="text-sm text-muted">Loading</p>}

      {LIVE_MODE && !isLoading && data && !data.available && (
        <div className="border border-border rounded-lg p-6 text-sm text-muted">
          Engineering health data isn't available here. The{" "}
          <code className="font-mono text-ink">orchestration/</code> directory is excluded from
          production and only available in local development.
        </div>
      )}

      {LIVE_MODE && data?.available && data.dashboard && (
        <>
          <section aria-label="Overview" className="mb-9">
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border"
              variants={reduceMotion ? undefined : motionVariants.staggerContainer}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
            >
              <StatTile label="Overall score" value={`${data.dashboard.overall_score.value}/100`} />
              <StatTile
                label="Tasks complete"
                value={`${data.dashboard.task_progress.completion_percentage}%`}
              />
              <StatTile
                label="Current sprint"
                value={data.dashboard.sprint_progress?.current_sprint ?? "—"}
              />
              <StatTile
                label="Certification"
                value={data.benchmark?.current_certification_status?.level_name ?? "—"}
              />
            </motion.div>
          </section>

          <div className="flex flex-col lg:flex-row gap-5 mb-9">
            <motion.section
              aria-label="Scores by dimension"
              className="lg:w-1/2 border border-border rounded-lg p-4"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <h2 className="text-xs font-medium text-faint mb-3">
                Scores by dimension
              </h2>
              {scoreRows.length > 0 ? (
                <ChartContainer height={Math.max(140, scoreRows.length * 32)}>
                  <BarChart
                    data={scoreRows}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      stroke={AXIS_COLOR}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="dimension"
                      stroke={AXIS_COLOR}
                      fontSize={10}
                      width={100}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip formatter={(v) => [`${v}/100`, "Score"]} />} />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                      {scoreRows.map((d, i) => (
                        <Cell key={d.dimension} fill={colorForIndex(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
               ) : (
                 <p className="text-sm text-faint">No dimension scores yet.</p>
               )}
            </motion.section>

            <motion.section
              aria-label="Tasks by priority"
              className="lg:w-1/2 border border-border rounded-lg p-4"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease: "easeOut" }}
            >
              <h2 className="text-xs font-medium text-faint mb-3">
                Tasks by priority
              </h2>
              {priorityRows.length > 0 ? (
                <ChartContainer height={160}>
                  <BarChart data={priorityRows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                      dataKey="priority"
                      stroke={AXIS_COLOR}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={AXIS_COLOR}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill="#34D399" />
                    <Bar
                      dataKey="remaining"
                      name="Remaining"
                      stackId="a"
                      fill="#5A5A6B"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-faint">No task-priority data yet.</p>
              )}
            </motion.section>
          </div>

          <div className="flex flex-col lg:flex-row gap-5 mb-9">
            <motion.section
              aria-label="Alerts"
              className="lg:w-1/2 border border-border rounded-lg p-4"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <h2 className="text-xs font-medium text-faint mb-3">
                Alerts
              </h2>
              {data.dashboard.alerts.length === 0 ? (
                <p className="text-sm text-faint">No alerts.</p>
              ) : (
                <motion.ul
                  className="space-y-2"
                  variants={reduceMotion ? undefined : motionVariants.staggerContainer}
                  initial={reduceMotion ? false : "hidden"}
                  animate="visible"
                >
                  {data.dashboard.alerts.map((a, i) => (
                    <motion.li key={i} className="text-sm flex items-start gap-2" variants={motionVariants.staggerItem}>
                      <AlertTriangle
                        size={13}
                        className={`mt-0.5 shrink-0 ${SEVERITY_STYLE[a.severity] ?? "text-muted"}`}
                        aria-hidden="true"
                      />
                      <span className="text-ink">{a.message}</span>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </motion.section>

            <motion.section
              aria-label="Recent activity"
              className="lg:w-1/2 border border-border rounded-lg p-4"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease: "easeOut" }}
            >
              <h2 className="text-xs font-medium text-faint mb-3">
                Recent activity
              </h2>
              {data.dashboard.recent_activity.length === 0 ? (
                <p className="text-sm text-faint">No recent activity.</p>
              ) : (
                <motion.ul
                  className="space-y-2"
                  variants={reduceMotion ? undefined : motionVariants.staggerContainer}
                  initial={reduceMotion ? false : "hidden"}
                  animate="visible"
                >
                  {data.dashboard.recent_activity.slice(0, 10).map((a, i) => (
                    <motion.li key={i} className="text-sm text-ink" variants={motionVariants.staggerItem}>
                      <span className="text-faint font-mono text-xs mr-2">{a.timestamp}</span>
                      {a.event}
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </motion.section>
          </div>
        </>
      )}
    </motion.div>
  )
}
