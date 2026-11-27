import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  ArrowDown,
  Boxes,
  CornerDownRight,
  Gauge,
  Layers,
  Route,
  Search,
  SearchX,
  Sparkles,
} from "lucide-react"
import {
  AtmosphereLayer,
  Badge,
  Button,
  CapabilityCard,
  Drawer,
  EmptyState,
  InlineNotice,
  MetricTile,
  SafeMarkdown,
  CapabilitySegmentedControl,
  Skeleton,
  TwoToneHeading,
} from "../components/ui"
import { NoProjectState, ProjectPicker } from "../components/capabilities/ProjectScope"
import { useScopedProject } from "../components/capabilities/useScopedProject"
import { SKILL_DOMAINS, domainMeta, skillTitle } from "../components/capabilities/skillDomains"
import { fetchSkillCatalog, fetchSkillDetail, routeTask, type RouteResult } from "../lib/skillsData"
import { DEPARTMENTS } from "../lib/skillRouterPreview"
import type { SkillManifest, SkillTelemetryRecord } from "../lib/kernelApi"
import { LIVE_MODE } from "../lib/env"

const pct = (n: number) => `${Math.round(n * 100)}%`

function successRate(t?: SkillTelemetryRecord): number | null {
  if (!t || t.invocations < 1) return null
  return t.passed_count / t.invocations
}

export default function SkillsPage() {
  const { projectId, setProjectId, projects, isLoading: projectsLoading } = useScopedProject()
  const [domain, setDomain] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [openSkill, setOpenSkill] = useState<string | null>(null)

  const catalogQuery = useQuery({
    queryKey: ["capabilities", "skills", projectId],
    queryFn: () => fetchSkillCatalog(projectId as string),
    enabled: Boolean(projectId),
  })
  const data = catalogQuery.data

  const telemetryByName = useMemo(
    () => new Map((data?.telemetry ?? []).map((t) => [t.skill_name, t])),
    [data?.telemetry]
  )

  const stats = useMemo(() => {
    const t = data?.telemetry ?? []
    const invocations = t.reduce((a, r) => a + r.invocations, 0)
    const passed = t.reduce((a, r) => a + r.passed_count, 0)
    const domains = Object.values(data?.domainCounts ?? {}).filter((n) => n > 0).length
    return { invocations, success: invocations ? passed / invocations : null, domains }
  }, [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.skills ?? []).filter((s) => {
      if (domain !== "all" && s.domain !== domain) return false
      if (!q) return true
      return (
        s.name.includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q))
      )
    })
  }, [data?.skills, domain, query])

  const domainItems = useMemo(
    () => [
      { value: "all", label: "All", count: data?.skills.length },
      ...SKILL_DOMAINS.map((d) => ({ value: d.key, label: d.label, count: data ? data.domainCounts[d.key] ?? 0 : undefined })),
    ],
    [data]
  )

  const noProject = LIVE_MODE && !projectsLoading && !projectId

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <header className="relative isolate overflow-hidden rounded-2xl border border-border-soft px-5 py-8 sm:px-8 sm:py-10">
        <AtmosphereLayer hue="olive" origin="0% 0%" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Badge variant="accent">Skill engine</Badge>
            <TwoToneHeading className="mt-4" lead="Skills." muted="What your agents know how to do." />
            <p className="mt-3 max-w-xl text-body text-muted">
              The engine's capability catalogue. Every agent task is routed to the skills whose keywords,
              departments and permissions fit, with dependencies resolved first.
            </p>
          </div>
          <ProjectPicker className="self-start md:self-auto" projectId={projectId} projects={projects} onChange={setProjectId} />
        </div>
      </header>

      {noProject ? (
        <div className="mt-8">
          <NoProjectState what="Skills" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <section aria-label="Skill engine stats" className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricTile icon={Boxes} label="Total skills" value={data?.totalSkills ?? 0} loading={!data && !catalogQuery.isError} hint="SKILL.md manifests" />
            <MetricTile icon={Layers} label="Domains" value={stats.domains} loading={!data && !catalogQuery.isError} hint="of 9 engine domains" />
            <MetricTile
              icon={Activity}
              label="Invocations"
              value={stats.invocations.toLocaleString()}
              loading={!data && !catalogQuery.isError}
              hint="recorded since engine start"
            />
            <MetricTile
              icon={Gauge}
              label="Avg success"
              value={stats.success === null ? "—" : pct(stats.success)}
              loading={!data && !catalogQuery.isError}
              hint="passed / invocations"
            />
          </section>

          <RouteTaskBox projectId={projectId} skills={data?.skills ?? []} telemetry={data?.telemetry ?? []} onOpenSkill={setOpenSkill} />

          {/* Catalogue */}
          <section aria-labelledby="catalogue-heading" className="mt-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TwoToneHeading as="h2" size="title" id="catalogue-heading" lead="Catalogue" muted={data ? `${filtered.length} of ${data.skills.length}` : undefined} />
              <div className="relative w-full lg:w-72">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search skills"
                  placeholder="Search skills, keywords…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-9 w-full rounded-pill border border-border bg-panel pl-10 pr-4 text-caption text-ink outline-none placeholder:text-faint focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              </div>
            </div>
            <CapabilitySegmentedControl
              className="mt-4"
              ariaLabel="Filter by domain"
              value={domain}
              onChange={setDomain}
              items={domainItems}
              size="sm"
            />

            <div className="mt-5">
              {catalogQuery.isError ? (
                <InlineNotice
                  title="Couldn't load the skill catalogue."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => catalogQuery.refetch()}>
                      Retry
                    </Button>
                  }
                >
                  The skill engine didn't respond. Check the backend and try again.
                </InlineNotice>
              ) : !data ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading skills">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-56 rounded-xl border border-border bg-panel p-5">
                      <Skeleton className="h-9 w-9" />
                      <Skeleton className="mt-6 h-4 w-2/3" />
                      <Skeleton className="mt-2 h-3 w-full" />
                      <Skeleton className="mt-1.5 h-3 w-4/5" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-border bg-panel">
                  <EmptyState
                    icon={SearchX}
                    title="No skills match"
                    description="Try another keyword or switch back to all domains."
                    secondaryAction={{
                      label: "Clear filters",
                      onClick: () => {
                        setQuery("")
                        setDomain("all")
                      },
                    }}
                  />
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Skills">
                  {filtered.map((s) => (
                    <li key={s.name}>
                      <SkillCard skill={s} telemetry={telemetryByName.get(s.name)} onOpen={() => setOpenSkill(s.name)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      <SkillDrawer
        projectId={projectId}
        name={openSkill}
        onClose={() => setOpenSkill(null)}
        skills={data?.skills ?? []}
        telemetry={openSkill ? telemetryByName.get(openSkill) : undefined}
        onOpenSkill={setOpenSkill}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function SkillCard({ skill, telemetry, onOpen }: { skill: SkillManifest; telemetry?: SkillTelemetryRecord; onOpen: () => void }) {
  const meta = domainMeta(skill.domain)
  const rate = successRate(telemetry)
  return (
    <CapabilityCard
      hue={meta.hue}
      origin={meta.origin}
      icon={meta.icon}
      title={skillTitle(skill.name)}
      ariaLabel={`${skillTitle(skill.name)}: ${skill.description}`}
      eyebrow={<span className="font-mono text-2xs text-muted">v{skill.version}</span>}
      description={<span className="line-clamp-2">{skill.description}</span>}
      onClick={onOpen}
      footer={
        <>
          <span className="truncate">{skill.allowed_departments.join(" · ") || "all departments"}</span>
          {rate !== null && <span className="shrink-0 font-mono tabular-nums text-muted">{pct(rate)}</span>}
        </>
      }
    >
      <span className="flex flex-wrap gap-1.5">
        {skill.keywords.slice(0, 3).map((k) => (
          <span key={k} className="rounded-pill border border-border-soft bg-base/40 px-2 py-0.5 text-2xs text-muted">
            {k}
          </span>
        ))}
        {skill.keywords.length > 3 && <span className="px-1 py-0.5 text-2xs text-faint">+{skill.keywords.length - 3}</span>}
      </span>
    </CapabilityCard>
  )
}

// ---------------------------------------------------------------------------

function RouteTaskBox({
  projectId,
  skills,
  telemetry,
  onOpenSkill,
}: {
  projectId: string | null
  skills: SkillManifest[]
  telemetry: SkillTelemetryRecord[]
  onOpenSkill: (name: string) => void
}) {
  const [objective, setObjective] = useState("")
  const [department, setDepartment] = useState("engineering")
  const [result, setResult] = useState<RouteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const tooShort = objective.trim().length < 3

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (tooShort || !projectId || pending) return
    setPending(true)
    setError(null)
    try {
      setResult(await routeTask(projectId, { department, objective: objective.trim(), topK: 4 }, { skills, telemetry }))
    } catch {
      setError("The router didn't answer. Try again in a moment.")
    } finally {
      setPending(false)
    }
  }

  const maxScore = Math.max(1, ...(result?.activations.map((a) => a.score) ?? [1]))

  return (
    <section aria-labelledby="route-heading" className="relative isolate mt-6 overflow-hidden rounded-xl border border-border bg-panel p-5 sm:p-6">
      <AtmosphereLayer hue="rust" origin="100% 0%" />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <form onSubmit={submit} className="flex flex-col gap-3" aria-describedby="route-hint">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-muted" aria-hidden="true" />
            <h2 id="route-heading" className="text-body font-medium text-ink">
              Route a task
            </h2>
            {!LIVE_MODE && <Badge size="sm" variant="accent">Preview</Badge>}
          </div>
          <p id="route-hint" className="text-caption text-muted">
            Describe a task and see which skills the router would activate.
            {!LIVE_MODE && " Computed in your browser with the engine's scoring rules."}
          </p>
          <label htmlFor="route-objective" className="sr-only">
            Task
          </label>
          <textarea
            id="route-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="e.g. Add rate limiting and validation to the billing API endpoints"
            className="w-full resize-none rounded-lg border border-border bg-base/60 px-3.5 py-2.5 text-caption text-ink outline-none placeholder:text-faint focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative inline-flex items-center">
              <span className="sr-only">Department</span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-9 appearance-none rounded-pill border border-glass-border bg-glass px-4 text-caption capitalize text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm" variant="primary" className="text-[rgb(var(--bg))]" disabled={tooShort || !projectId || skills.length === 0} loading={pending}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Route
            </Button>
          </div>
        </form>

        <div aria-live="polite" className="min-h-[8rem]">
          {error ? (
            <p role="alert" className="text-caption text-error">
              {error}
            </p>
          ) : !result ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-soft p-6 text-center text-caption text-faint">
              Activations will appear here, ranked by score.
            </div>
          ) : result.activations.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-soft p-6 text-center text-caption text-muted">
              No skill matched for the {department} department. Try naming the work more concretely.
            </div>
          ) : (
            <ol className="space-y-2" aria-label="Activated skills">
              {result.activations.map((a, i) => {
                const meta = domainMeta(a.domain)
                return (
                  <li key={a.skill_name} className="rounded-lg border border-border-soft bg-base/50 px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-4 font-mono text-xs text-faint">{i + 1}</span>
                      <meta.icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => onOpenSkill(a.skill_name)}
                        className="truncate text-left text-caption font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {skillTitle(a.skill_name)}
                      </button>
                      <span className="ml-auto font-mono text-xs tabular-nums text-ink">{a.score.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-pill bg-ink/[0.06]" aria-hidden="true">
                      <div className="h-full rounded-pill bg-ink/70" style={{ width: `${Math.max(6, (a.score / maxScore) * 100)}%` }} />
                    </div>
                    {a.resolved_dependencies.length > 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
                        <CornerDownRight className="h-3 w-3" aria-hidden="true" />
                        loads first: {a.resolved_dependencies.map(skillTitle).join(" → ")}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function SkillDrawer({
  projectId,
  name,
  onClose,
  skills,
  telemetry,
  onOpenSkill,
}: {
  projectId: string | null
  name: string | null
  onClose: () => void
  skills: SkillManifest[]
  telemetry?: SkillTelemetryRecord
  onOpenSkill: (name: string) => void
}) {
  const detail = useQuery({
    queryKey: ["capabilities", "skill", projectId, name],
    queryFn: () => fetchSkillDetail(projectId as string, name as string),
    enabled: Boolean(projectId && name),
  })
  const usedBy = useMemo(() => (name ? skills.filter((s) => s.dependencies.includes(name)).map((s) => s.name) : []), [skills, name])
  if (!name) return null
  const skill = detail.data?.skill
  const meta = domainMeta(skill?.domain ?? skills.find((s) => s.name === name)?.domain ?? "")
  const rate = successRate(telemetry)

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={skillTitle(name)} className="w-full max-w-full sm:w-[36rem]">
      {detail.isError ? (
        <InlineNotice title="Couldn't load this skill." action={<Button variant="secondary" size="sm" onClick={() => detail.refetch()}>Retry</Button>} />
      ) : !skill ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading skill">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-7 pb-4">
          <div className="relative isolate overflow-hidden rounded-xl border border-border p-4">
            <AtmosphereLayer hue={meta.hue} origin={meta.origin} />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <Badge size="sm">
                  <meta.icon className="h-3 w-3" aria-hidden="true" />
                  {meta.label}
                </Badge>
                <span className="font-mono text-2xs text-muted">v{skill.version}</span>
                <span className="font-mono text-2xs text-faint">{skill.origin}</span>
              </div>
              <p className="mt-3 text-caption text-ink">{skill.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skill.keywords.map((k) => (
                  <span key={k} className="rounded-pill border border-border-soft bg-base/40 px-2 py-0.5 text-2xs text-muted">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <DrawerSection title="Telemetry">
            <dl className="grid grid-cols-3 gap-2">
              <MiniStat label="Success rate" value={rate === null ? "—" : pct(rate)} />
              <MiniStat label="Invocations" value={String(telemetry?.invocations ?? 0)} />
              <MiniStat
                label="Routing boost"
                value={telemetry ? `${telemetry.routing_boost >= 0 ? "+" : ""}${telemetry.routing_boost.toFixed(2)}` : "0.00"}
              />
            </dl>
            {!telemetry && <p className="mt-2 text-xs text-faint">No runs recorded yet. The boost starts at zero.</p>}
          </DrawerSection>

          <DrawerSection title="Dependency chain">
            <DependencyChain chain={detail.data?.resolved_dependencies ?? []} self={skill.name} usedBy={usedBy} onOpen={onOpenSkill} />
          </DrawerSection>

          <div className="grid gap-6 sm:grid-cols-2">
            <DrawerSection title="Permissions">
              <ChipList items={skill.required_permissions} mono />
            </DrawerSection>
            <DrawerSection title="Allowed departments">
              <ChipList items={skill.allowed_departments.length ? skill.allowed_departments : ["all"]} />
            </DrawerSection>
          </div>

          <DrawerSection title="Instructions">
            {skill.instructions ? (
              <div className="rounded-xl border border-border-soft bg-base/40 p-4">
                <SafeMarkdown source={skill.instructions} />
              </div>
            ) : (
              <p className="text-caption text-faint">This skill ships no instructions body.</p>
            )}
            {skill.source_path && <p className="mt-2 truncate font-mono text-2xs text-faint">{skill.source_path}</p>}
          </DrawerSection>
        </div>
      )}
    </Drawer>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-medium text-faint">{title}</h3>
      {children}
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-soft bg-base/40 px-3 py-2.5">
      <dt className="text-2xs text-faint">{label}</dt>
      <dd className="mt-1 font-mono text-title tabular-nums text-ink">{value}</dd>
    </div>
  )
}

function ChipList({ items, mono }: { items: string[]; mono?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((p) => (
        <li key={p} className={`rounded-pill border border-border bg-ink/[0.04] px-2.5 py-0.5 text-xs text-muted ${mono ? "font-mono" : "capitalize"}`}>
          {p.replace(/_/g, mono ? "_" : " ")}
        </li>
      ))}
    </ul>
  )
}

/** Vertical chain: resolved dependencies (load order) → this skill → skills that depend on it. */
function DependencyChain({ chain, self, usedBy, onOpen }: { chain: string[]; self: string; usedBy: string[]; onOpen: (n: string) => void }) {
  const Node = ({ name, current }: { name: string; current?: boolean }) =>
    current ? (
      <span className="inline-flex items-center gap-2 rounded-pill border border-accent/30 bg-accent/[0.12] px-3 py-1 text-xs font-medium text-accent">
        {skillTitle(name)}
      </span>
    ) : (
      <button
        type="button"
        onClick={() => onOpen(name)}
        className="inline-flex items-center rounded-pill border border-border bg-panel-alt px-3 py-1 text-xs text-ink hover:border-ink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {skillTitle(name)}
      </button>
    )
  const Arrow = () => <ArrowDown className="my-1 ml-3 h-3.5 w-3.5 text-faint" aria-hidden="true" />
  return (
    <div className="rounded-xl border border-border-soft bg-base/40 p-4">
      <ol aria-label="Load order" className="flex flex-col items-start">
        {chain.map((n) => (
          <li key={n} className="flex flex-col items-start">
            <Node name={n} />
            <Arrow />
          </li>
        ))}
        <li>
          <Node name={self} current />
        </li>
      </ol>
      {chain.length === 0 && <p className="mt-2 text-xs text-faint">No dependencies. Loads on its own.</p>}
      {usedBy.length > 0 && (
        <div className="mt-4 border-t border-border-soft pt-3">
          <p className="mb-2 text-2xs text-faint">Required by</p>
          <div className="flex flex-wrap gap-1.5">
            {usedBy.map((n) => (
              <Node key={n} name={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
