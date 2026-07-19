import { useEffect, useMemo, useState, useRef } from "react"
import toast from "react-hot-toast"
import { Loader2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts"
import { usePMStore } from "../../store/pmStore"
import { sprintsApi } from "../../lib/pmApi"
import { SummaryChip } from "../../components/SummaryChip"
import { ChartContainer } from "../../components/charts/ChartContainer"
import { ChartTooltip } from "../../components/charts/ChartTooltip"
import { colorForIndex } from "../../components/charts/palette"
import { useGsapFrom } from "../../lib/animations"
import { motion, motionVariants } from "../../lib/animations"
import { presets } from "../../lib/animationPresets"

const AXIS_COLOR = "#5A5A6B"
const GRID_COLOR = "#22222E"

const CEREMONIES = [
  { key: "standup", label: "Stand-up", action: (id: string) => sprintsApi.standup(id) },
  { key: "review", label: "Sprint Review", action: (id: string) => sprintsApi.review(id) },
  { key: "retro", label: "Retrospective", action: (id: string) => sprintsApi.retro(id) },
  { key: "riskReport", label: "Risk Report", action: (id: string) => sprintsApi.riskReport(id) },
  { key: "techDebt", label: "Tech Debt", action: (id: string) => sprintsApi.techDebt(id) },
] as const

export default function SprintsTab() {
  const { sprints, tasks } = usePMStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reports, setReports] = useState<{
    reviews: any[]
    retros: any[]
    risk_reports: any[]
    tech_debt: any[]
  } | null>(null)
  const [standups, setStandups] = useState<any[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedId && sprints.length > 0) setSelectedId(sprints[0].id)
  }, [sprints, selectedId])

  const loadReports = (sprintId: string) => {
    sprintsApi
      .reports(sprintId)
      .then(setReports)
      .catch(() => {})
    sprintsApi
      .standups(sprintId)
      .then(setStandups)
      .catch(() => {})
  }

  useEffect(() => {
    if (selectedId) loadReports(selectedId)
  }, [selectedId])

  const selected = sprints.find((s) => s.id === selectedId)

  const sprintChartData = useMemo(
    () =>
      sprints.map((s) => ({
        name: s.name || `Sprint ${s.sprint_number}`,
        capacity: s.capacity,
        velocity: s.velocity,
        storyPointsPlanned: s.story_points_planned,
      })),
    [sprints]
  )

  const handleGenerate = async (key: string, action: (id: string) => Promise<unknown>) => {
    if (!selectedId) return
    setGenerating(key)
    try {
      await action(selectedId)
      loadReports(selectedId)
      toast.success("Generated")
    } catch {
      toast.error("Generation failed")
    } finally {
      setGenerating(null)
    }
  }

  useGsapFrom(".recharts-bar-rectangle", { scaleY: 0, transformOrigin: "bottom", duration: 0.6, stagger: 0.05, ease: "power2.out" }, [sprintChartData, selectedId])

  if (sprints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        No sprints planned yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <section className="shrink-0 border-b border-border p-4">
        <motion.h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3" variants={motionVariants.fadeIn}>
          Velocity &amp; capacity across sprints
        </motion.h3>
        <motion.div ref={chartRef} variants={motionVariants.fadeUp} initial="hidden" animate="visible">
          <ChartContainer height={160}>
            <BarChart data={sprintChartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="name"
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
              <Bar dataKey="capacity" name="Capacity" fill={colorForIndex(0)} radius={[3, 3, 0, 0]} />
              <Bar dataKey="velocity" name="Velocity" fill={colorForIndex(1)} radius={[3, 3, 0, 0]} />
              <Bar
                dataKey="storyPointsPlanned"
                name="Story points planned"
                fill={colorForIndex(2)}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </motion.div>
      </section>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r border-border overflow-y-auto p-2">
          <motion.div className="space-y-0.5" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {sprints.map((s, i) => (
              <motion.button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                variants={motionVariants.staggerItem}
                custom={i}
                whileHover={{ x: 2, transition: { type: "spring", stiffness: 400, damping: 20 } }}
                className={`w-full text-left px-3 py-3 border-l-2 mb-0.5 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 ${
                  s.id === selectedId
                    ? "border-ink bg-panel-alt"
                    : "border-transparent hover:bg-panel-alt"
                }`}
              >
                <p className="text-sm font-medium text-ink truncate mb-1">
                  {s.name || `Sprint ${s.sprint_number}`}
                </p>
                <p className="text-xs text-muted">{s.status}</p>
              </motion.button>
            ))}
          </motion.div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {selected && (
            <motion.div variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
              <motion.h2 className="font-display text-xl font-medium text-ink mb-1" variants={motionVariants.fadeIn}>
                {selected.name || `Sprint ${selected.sprint_number}`}
              </motion.h2>
              <motion.p className="text-sm text-muted mb-6" variants={motionVariants.fadeIn}>{selected.goal}</motion.p>

              <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-8" variants={motionVariants.staggerContainer}>
                <motion.div variants={motionVariants.staggerItem} custom={0}><SummaryChip label="Capacity" value={String(selected.capacity)} /></motion.div>
                <motion.div variants={motionVariants.staggerItem} custom={1}><SummaryChip label="Velocity" value={String(selected.velocity)} /></motion.div>
                <motion.div variants={motionVariants.staggerItem} custom={2}><SummaryChip label="Story points" value={String(selected.story_points_planned)} /></motion.div>
                <motion.div variants={motionVariants.staggerItem} custom={3}>
                  <SummaryChip
                    label="Completion odds"
                    value={`${Math.round((selected.completion_probability ?? 0) * 100)}%`}
                    warn={(selected.completion_probability ?? 1) < 0.5}
                  />
                </motion.div>
              </motion.div>

              <motion.div className="flex flex-wrap gap-2 mb-8" variants={motionVariants.fadeIn}>
                {CEREMONIES.map((c) => (
                  <motion.button
                    key={c.key}
                    onClick={() => handleGenerate(c.key, c.action)}
                    disabled={generating === c.key}
                    {...presets.button}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-ink hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
                  >
                    {generating === c.key && (
                      <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                    )}
                    Generate {c.label}
                  </motion.button>
                ))}
              </motion.div>

              <motion.div className="space-y-8" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
                {standups.length > 0 && (
                  <motion.section variants={motionVariants.staggerItem}>
                    <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">
                      Latest stand-up
                    </h3>
                    <div className="text-sm text-ink space-y-1.5">
                      <p>
                        <span className="text-muted">Yesterday:</span> {standups[0].yesterday}
                      </p>
                      <p>
                        <span className="text-muted">Today:</span> {standups[0].today}
                      </p>
                      {standups[0].blockers?.length > 0 && (
                        <p>
                          <span className="text-muted">Blockers:</span>{" "}
                          {standups[0].blockers.join(", ")}
                        </p>
                      )}
                      <p>
                        <span className="text-muted">Health:</span> {standups[0].sprint_health}
                      </p>
                    </div>
                  </motion.section>
                )}

                {reports?.reviews?.[0] && (
                  <motion.section variants={motionVariants.staggerItem}>
                    <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">
                      Sprint review
                    </h3>
                    <p className="text-sm text-ink leading-relaxed">{reports.reviews[0].summary}</p>
                  </motion.section>
                )}

                {reports?.retros?.[0] && (
                  <motion.section variants={motionVariants.staggerItem}>
                    <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">
                      Retrospective
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-medium text-ok mb-1">Went well</p>
                        <ul className="space-y-1 text-ink">
                          {reports.retros[0].what_went_well?.map((s: string, i: number) => (
                            <li key={i}>— {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-error mb-1">Went wrong</p>
                        <ul className="space-y-1 text-ink">
                          {reports.retros[0].what_went_wrong?.map((s: string, i: number) => (
                            <li key={i}>— {s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.section>
                )}

                {reports?.risk_reports?.[0] && (
                  <motion.section variants={motionVariants.staggerItem}>
                    <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">
                      Risk report
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {reports.risk_reports[0].risks?.map((r: any, i: number) => (
                        <li key={i} className="text-ink">
                          <span className="text-[10px] uppercase font-medium text-warn mr-2">
                            {r.severity}
                          </span>
                          {r.description}
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                )}

                {reports?.tech_debt?.[0] && (
                  <motion.section variants={motionVariants.staggerItem}>
                    <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">
                      Technical debt
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {reports.tech_debt[0].items?.map((item: any, i: number) => (
                        <li key={i} className="text-ink">
                          <span className="text-[10px] uppercase font-medium text-muted mr-2">
                            {item.severity}
                          </span>
                          {item.description}
                          {item.location && <span className="text-faint"> — {item.location}</span>}
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                )}
              </motion.div>

              <motion.div className="mt-8 pt-6 border-t border-border-soft" variants={motionVariants.fadeIn}>
                <p className="text-xs text-muted mb-3">
                  {tasks.filter((t) => t.sprint_id === selected.id).length} tasks in this sprint
                </p>
              </motion.div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  )
}
