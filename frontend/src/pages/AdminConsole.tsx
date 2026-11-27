import { useMemo, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import toast from "react-hot-toast"
import {
  Activity,
  Search,
  Users,
  CreditCard,
  Zap,
  Database,
  Server,
  AlertTriangle,
  Download,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { motion, useReducedMotion } from "motion/react"
import { motionVariants } from "../lib/animations"
import { presets } from "../lib/animationPresets"
import { adminApi, analyticsApi } from "../lib/api"
import { LIVE_MODE } from "../lib/env"
import BrandLogo from "../components/BrandLogo"
import { StatusPill } from "../components/StatusPill"
import { ChartContainer } from "../components/charts/ChartContainer"
import { ChartTooltip } from "../components/charts/ChartTooltip"
import { colorForIndex } from "../components/charts/palette"
import { pivotAiUsageByDate } from "../lib/chartTransforms"

const AXIS_COLOR = "#64748B" // cool slate axis tick ink
const GRID_COLOR = "rgba(148, 163, 184, 0.18)" // hairline studio chart grid

interface AdminUser {
  id: string
  email: string
  name: string
  plan: string
  credits: number
  created_at: string
}

interface AdminBuildRow {
  id: string
  status: string
  credits_used: number
  debug_iterations: number
  created_at: string
}

interface AnalyticsOverview {
  total_users: number
  total_builds: number
  total_revenue: number
  active_subscriptions: number
}

interface ServiceStatus {
  status: string
  [key: string]: unknown
}

interface SystemHealth {
  status: string
  database: ServiceStatus
  redis: ServiceStatus
  uptime_seconds: number
}

interface RevenueDay {
  date: string
  revenue: number
  subscriptions: number
  credit_purchases: number
}

interface AIUsageDay {
  date: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
}

interface BuildSuccessRateMetrics {
  period: string
  total_builds: number
  successful_builds: number
  success_rate: number
  daily_breakdown: Array<{ date: string; total: number; successful: number; rate: number }>
}

interface SecurityEventDay {
  date: string
  severity: string
  event_type: string
  count: number
}

// Mirrors the status normalization already used in ProjectHistory.tsx, since
// StatusPill's vocabulary (complete/running/debugging/failed) predates the
// backend's BuildStatus enum (pending/running/success/failed/debugging).
function toPillStatus(status: string): "complete" | "running" | "debugging" | "failed" {
  if (status === "success") return "complete"
  if (status === "failed") return "failed"
  if (status === "running") return "running"
  return "debugging"
}

export default function AdminConsole() {
  const [search, setSearch] = useState("")
  const reduceMotion = useReducedMotion()

  const { data: overview } = useQuery<AnalyticsOverview>({
    queryKey: ["admin-overview"],
    queryFn: () => adminApi.overview(),
    enabled: LIVE_MODE,
  })

  const { data: health } = useQuery<SystemHealth>({
    queryKey: ["admin-health"],
    queryFn: () => adminApi.systemHealth(),
    enabled: LIVE_MODE,
    refetchInterval: LIVE_MODE ? 30_000 : false,
  })

  const { data: buildsData } = useQuery<{ builds: AdminBuildRow[] }>({
    queryKey: ["admin-builds"],
    queryFn: () => adminApi.listBuilds(),
    enabled: LIVE_MODE,
  })

  const { data: usersData, refetch: refetchUsers } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["admin-users", search],
    queryFn: () => adminApi.listUsers(search || undefined),
    enabled: LIVE_MODE,
  })

  const { data: revenueData } = useQuery<RevenueDay[]>({
    queryKey: ["admin-revenue"],
    queryFn: () => adminApi.revenue(30),
    enabled: LIVE_MODE,
  })

  const { data: aiUsageData } = useQuery<AIUsageDay[]>({
    queryKey: ["admin-ai-usage"],
    queryFn: () => adminApi.aiUsage(30),
    enabled: LIVE_MODE,
  })

  const { data: buildSuccessData } = useQuery<BuildSuccessRateMetrics>({
    queryKey: ["admin-build-success"],
    queryFn: () => analyticsApi.buildSuccess(30),
    enabled: LIVE_MODE,
  })

  const { data: securityEventsData } = useQuery<SecurityEventDay[]>({
    queryKey: ["admin-security-events"],
    queryFn: () => adminApi.securityEventsByDay(30),
    enabled: LIVE_MODE,
  })

  const creditMutation = useMutation({
    mutationFn: (vars: { userId: string; amount: number }) =>
      adminApi.adjustCredits({
        user_id: vars.userId,
        amount: vars.amount,
        reason: "admin_adjustment",
      }),
    onSuccess: () => refetchUsers(),
  })

  const [exporting, setExporting] = useState(false)
  const handleExportUsers = async () => {
    setExporting(true)
    try {
      const blob = await adminApi.exportUsers(search || undefined)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `forge-users-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Couldn't export users.")
    } finally {
      setExporting(false)
    }
  }

  const builds = buildsData?.builds ?? []
  const users = usersData?.users ?? []
  const revenue = revenueData ?? []
  const aiUsage = aiUsageData ?? []
  const totalRevenue30d = revenue.reduce((sum, d) => sum + d.revenue, 0)
  const totalAiCost30d = aiUsage.reduce((sum, d) => sum + d.cost_usd, 0)

  const aiUsagePivoted = useMemo(() => pivotAiUsageByDate(aiUsageData ?? []), [aiUsageData])

  const buildSuccessDaily = buildSuccessData?.daily_breakdown ?? []
  const buildSuccessChartData = useMemo(
    () =>
      (buildSuccessData?.daily_breakdown ?? []).map((d) => ({
        date: d.date,
        successful: d.successful,
        failed: d.total - d.successful,
        rate: d.rate,
      })),
    [buildSuccessData]
  )
  const overallBuildSuccessRate =
    buildSuccessData && buildSuccessData.total_builds > 0
      ? buildSuccessData.successful_builds / buildSuccessData.total_builds
      : null

  const securityEventsDaily = securityEventsData ?? []
  const totalSecurityEvents30d = securityEventsDaily.reduce((sum, d) => sum + d.count, 0)
  // Only "medium"/"high" are produced anywhere in the code today (rate-limit
  // trips and anomaly detections) — see backend/core/security.py. The model
  // also documents "low"/"critical" as possible future severities.
  const securityChartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const row of securityEventsDaily) {
      const existing = byDate.get(row.date) ?? { date: row.date, medium: 0, high: 0 }
      if (row.severity === "medium" || row.severity === "high") {
        existing[row.severity] = (Number(existing[row.severity]) || 0) + row.count
      }
      byDate.set(row.date, existing)
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [securityEventsData])

  return (
    <motion.div
      className="px-6 md:px-10 py-8 md:py-10 max-w-7xl mx-auto bg-base text-ink"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
        <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
        Admin
      </div>
      <header className="flex items-center gap-3 mb-10">
        <BrandLogo size="md" />
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">
          Admin
        </h1>
      </header>

      {!LIVE_MODE && (
        <div className="mb-9 bg-warn/10 border border-warn/30 text-warn px-4 py-3 rounded-lg text-sm">
          Demo mode — connect a backend to view live data.
        </div>
      )}

      {/* Stat cards */}
      <section aria-label="Platform statistics" className="mb-9">
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          <StatCard label="Users" value={overview?.total_users ?? "—"} icon={Users} />
          <StatCard label="Builds" value={overview?.total_builds ?? "—"} icon={Activity} />
          <StatCard
            label="Revenue"
            value={overview ? `$${overview.total_revenue.toLocaleString()}` : "—"}
            icon={CreditCard}
          />
          <StatCard
            label="Active subscriptions"
            value={overview?.active_subscriptions ?? "—"}
            icon={Zap}
          />
        </motion.div>
      </section>

      {/* Two-column: system health + builds */}
      <div className="flex flex-col lg:flex-row gap-5 mb-9">
        <motion.section
          aria-label="System health"
          className="lg:w-1/3 glass-strong rounded-lg p-4"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <h2 className="text-xs font-medium text-faint mb-3">
            System health
          </h2>
          <motion.div
            className="divide-y divide-border-soft"
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            <ServiceRow icon={Server} label="API" status={health?.status} />
            <ServiceRow
              icon={Database}
              label="Database"
              status={health?.database?.status as string | undefined}
            />
            <ServiceRow
              icon={Zap}
              label="Redis"
              status={health?.redis?.status as string | undefined}
            />
          </motion.div>
        </motion.section>

        <motion.section
          aria-label="Recent builds"
          className="flex-1 glass-strong rounded-lg overflow-hidden"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease: "easeOut" }}
        >
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-xs font-medium text-faint">
              Recent builds
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Build
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Credits
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Created
                  </th>
                </tr>
              </thead>
              <motion.tbody
                variants={reduceMotion ? undefined : motionVariants.staggerContainer}
                initial={reduceMotion ? false : "hidden"}
                animate="visible"
              >
                {builds.map((b) => (
                  <motion.tr
                    key={b.id}
                    className="border-t border-border-soft hover:bg-panel-alt transition motion-reduce:transition-none"
                    variants={motionVariants.staggerItem}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-muted">{b.id.slice(0, 8)}…</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={toPillStatus(b.status)} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-ink">{b.credits_used}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-muted">
                        {new Date(b.created_at).toLocaleDateString()}
                      </span>
                    </td>
                  </motion.tr>
                ))}
                {builds.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-faint">
                      No builds yet — start a project to see activity here.
                    </td>
                  </tr>
                )}
              </motion.tbody>
            </table>
          </div>
        </motion.section>
      </div>

      {/* Revenue + AI usage (last 30 days) */}
      <div className="flex flex-col lg:flex-row gap-5 mb-9">
        <motion.section
          aria-label="Revenue (last 30 days)"
          className="lg:w-1/2 glass-strong rounded-lg overflow-hidden"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-xs font-medium text-faint">
              Revenue (30d)
            </h2>
            <span className="text-sm font-mono text-ink">${totalRevenue30d.toLocaleString()}</span>
          </div>
          {revenue.length > 0 && (
            <div className="px-4 pt-4">
              <ChartContainer height={160}>
                <AreaChart data={revenue} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="date"
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
                    width={40}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip formatter={(v) => [`$${v.toLocaleString()}`, "Revenue"]} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#2563EB"
                    fill="#2563EB"
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          )}
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Revenue
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Subscriptions
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Credit purchases
                  </th>
                </tr>
              </thead>
              <tbody>
                {revenue.map((d) => (
                  <tr key={d.date} className="border-t border-border-soft">
                    <td className="px-4 py-2.5 text-sm text-muted">{d.date}</td>
                    <td className="px-4 py-2.5 text-sm text-ink text-right font-mono">
                      ${d.revenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted text-right">{d.subscriptions}</td>
                    <td className="px-4 py-2.5 text-sm text-muted text-right">
                      {d.credit_purchases}
                    </td>
                  </tr>
                ))}
                {revenue.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-faint">
                      No revenue data yet — transactions will appear here as they occur.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>

        <motion.section
          aria-label="AI usage (last 30 days)"
          className="lg:w-1/2 glass-strong rounded-lg overflow-hidden"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease: "easeOut" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-xs font-medium text-faint">
              AI usage (30d)
            </h2>
            <span className="text-sm font-mono text-ink">${totalAiCost30d.toFixed(2)}</span>
          </div>
          {aiUsagePivoted.rows.length > 0 && (
            <div className="px-4 pt-4">
              <ChartContainer height={160}>
                <AreaChart
                  data={aiUsagePivoted.rows}
                  margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="date"
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
                    width={40}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(v, name) => [`$${v.toFixed(2)}`, name]} />}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {aiUsagePivoted.models.map((model, i) => (
                    <Area
                      key={model}
                      type="monotone"
                      dataKey={model}
                      name={model}
                      stackId="cost"
                      stroke={colorForIndex(i)}
                      fill={colorForIndex(i)}
                      fillOpacity={0.5}
                    />
                  ))}
                </AreaChart>
              </ChartContainer>
            </div>
          )}
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Model
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Tokens
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {aiUsage.map((d, i) => (
                  <tr key={`${d.date}-${d.model}-${i}`} className="border-t border-border-soft">
                    <td className="px-4 py-2.5 text-sm text-muted">{d.date}</td>
                    <td className="px-4 py-2.5 text-sm text-ink">{d.model}</td>
                    <td className="px-4 py-2.5 text-sm text-muted text-right font-mono">
                      {(d.prompt_tokens + d.completion_tokens).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-ink text-right font-mono">
                      ${d.cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {aiUsage.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-faint">
                      No AI usage data yet — activity will appear here as models are used.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>

      {/* Build success rate (last 30 days) */}
      <motion.section
        aria-label="Build success rate (last 30 days)"
        className="mb-9 glass-strong rounded-lg overflow-hidden"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-xs font-medium text-faint">
            Build success rate (30d)
          </h2>
          <span className="text-sm font-mono text-ink">
            {overallBuildSuccessRate === null
              ? "—"
              : `${(overallBuildSuccessRate * 100).toFixed(1)}%`}
          </span>
        </div>
        {buildSuccessChartData.length > 0 && (
          <div className="px-4 pt-4">
            <ChartContainer height={180}>
              <BarChart
                data={buildSuccessChartData}
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
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
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="successful" name="Successful" stackId="a" fill="#34D399" />
                <Bar
                  dataKey="failed"
                  name="Failed"
                  stackId="a"
                  fill="#EF4444"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-soft">
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Date
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                  Total
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                  Successful
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {buildSuccessDaily.map((d) => (
                <tr key={d.date} className="border-t border-border-soft">
                  <td className="px-4 py-2.5 text-sm text-muted">{d.date}</td>
                  <td className="px-4 py-2.5 text-sm text-muted text-right">{d.total}</td>
                  <td className="px-4 py-2.5 text-sm text-muted text-right">{d.successful}</td>
                  <td className="px-4 py-2.5 text-sm text-ink text-right font-mono">
                    {(d.rate * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              {buildSuccessDaily.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-faint">
                      No build data yet — results will appear here as builds complete.
                    </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* Security events (last 30 days) */}
      <motion.section
        aria-label="Security events (last 30 days)"
        className="mb-9 glass-strong rounded-lg overflow-hidden"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-xs font-medium text-faint">
            Security events (30d)
          </h2>
          <span className="text-sm font-mono text-ink">{totalSecurityEvents30d}</span>
        </div>
        {securityChartData.length > 0 && (
          <div className="px-4 pt-4">
            <ChartContainer height={160}>
              <BarChart data={securityChartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
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
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="medium" name="Medium (rate limit)" stackId="a" fill="#F59E0B" />
                <Bar
                  dataKey="high"
                  name="High (anomaly)"
                  stackId="a"
                  fill="#EF4444"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-soft">
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Date
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Severity
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Event type
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {securityEventsDaily.map((d, i) => (
                <tr
                  key={`${d.date}-${d.severity}-${d.event_type}-${i}`}
                  className="border-t border-border-soft"
                >
                  <td className="px-4 py-2.5 text-sm text-muted">{d.date}</td>
                  <td className="px-4 py-2.5 text-sm text-ink capitalize">{d.severity}</td>
                  <td className="px-4 py-2.5 text-sm text-muted">{d.event_type}</td>
                  <td className="px-4 py-2.5 text-sm text-ink text-right font-mono">{d.count}</td>
                </tr>
              ))}
              {securityEventsDaily.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-faint">
                      No security events in the last 30 days.
                    </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* Users */}
      <motion.section
        aria-label="Users"
        className="glass-strong rounded-lg overflow-hidden"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-xs font-medium text-faint">Users</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                 placeholder="Search users…"
                className="bg-transparent border border-border rounded-md h-9 pl-8 pr-4 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 w-64 transition"
              />
            </div>
            <motion.button
              onClick={handleExportUsers}
              disabled={exporting}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm text-ink hover:bg-panel-alt focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none disabled:opacity-50 shrink-0"
              {...presets.button}
            >
              <Download size={13} aria-hidden="true" />
              {exporting ? "Exporting" : "Export"}
            </motion.button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-soft">
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Email
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                  Plan
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                  Credits
                </th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <motion.tbody
              variants={reduceMotion ? undefined : motionVariants.staggerContainer}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
            >
              {users.map((u) => (
                <motion.tr
                  key={u.id}
                  className="border-t border-border-soft hover:bg-panel-alt transition motion-reduce:transition-none"
                  variants={motionVariants.staggerItem}
                >
                  <td className="px-4 py-2.5 text-sm text-ink">{u.email}</td>
                  <td className="px-4 py-2.5 text-sm text-muted">{u.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm capitalize text-muted">{u.plan}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-mono text-xs text-ink">{u.credits}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => creditMutation.mutate({ userId: u.id, amount: 100 })}
                      disabled={creditMutation.isPending}
                      className="text-xs px-3 py-1 rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
                    >
                      +100 credits
                    </button>
                  </td>
                </motion.tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-faint">
                    {search ? `No users match "${search}"` : "No users yet — invite someone to get started."}
                  </td>
                </tr>
              )}
            </motion.tbody>
          </table>
        </div>
      </motion.section>
    </motion.div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: typeof Users
}) {
  return (
    <motion.div className="glass-strong p-4" {...presets.card} variants={motionVariants.staggerItem}>
      <div className="w-9 h-9 border border-border flex items-center justify-center mb-3">
        <Icon size={16} className="text-ink" aria-hidden="true" />
      </div>
      <p className="font-mono text-[1.4rem] font-medium text-ink leading-none mb-1">{value}</p>
      <p className="text-xs text-faint">{label}</p>
    </motion.div>
  )
}

function ServiceRow({
  icon: Icon,
  label,
  status,
}: {
  icon: typeof Server
  label: string
  status?: string
}) {
  const ok = status === "ok"
  return (
    <motion.div className="flex items-center gap-3 py-2.5 first:pt-1" variants={motionVariants.staggerItem}>
      <Icon size={14} className="text-faint shrink-0" aria-hidden="true" />
      <span className="text-sm text-ink flex-1 truncate">{label}</span>
      {status === undefined ? (
        <span className="font-mono text-xs text-faint">—</span>
      ) : ok ? (
        <span className="font-mono text-xs text-ok">Healthy</span>
      ) : (
        <span className="flex items-center gap-1 font-mono text-xs text-error">
          <AlertTriangle size={11} aria-hidden="true" /> {status}
        </span>
      )}
    </motion.div>
  )
}
