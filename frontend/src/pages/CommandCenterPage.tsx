import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  FolderPlus,
  GitPullRequest,
  PlayCircle,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  AvatarStack,
  Badge,
  Button,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  StatTile,
  type BadgeVariant,
  type ProgressTone,
} from "../components/ui";
import { useFleetOverview, useGateDecision } from "../hooks/useFleetOverview";
import { useAuthStore } from "../store/authStore";
import { LIVE_MODE } from "../lib/env";
import { CURRENT_USER } from "../lib/mockData";
import { formatRelativeTime } from "../lib/format";
import {
  firstNameOf,
  fleetSummaryLine,
  greetingFor,
  type ActivityEvent,
  type ActivityKind,
  type FleetGate,
  type FleetRun,
  type FleetRunStatus,
  type GatewaySummary,
} from "../lib/commandCenterData";

// ─── Presentation maps ──────────────────────────────────────────────────────

const STATUS_META: Record<FleetRunStatus, { label: string; badge: BadgeVariant; tone: ProgressTone }> = {
  planning: { label: "Planning", badge: "info", tone: "info" },
  running: { label: "Running", badge: "success", tone: "ok" },
  awaiting_approval: { label: "Awaiting approval", badge: "warning", tone: "warn" },
  failed: { label: "Failed", badge: "error", tone: "error" },
};

const ACTIVITY_ICONS: Record<ActivityKind, { icon: LucideIcon; className: string }> = {
  run_started: { icon: PlayCircle, className: "text-info" },
  task_completed: { icon: Check, className: "text-ok" },
  gate_opened: { icon: ShieldCheck, className: "text-warn" },
  gate_approved: { icon: Check, className: "text-ok" },
  gate_rejected: { icon: X, className: "text-error" },
  run_failed: { icon: XCircle, className: "text-error" },
  run_completed: { icon: GitPullRequest, className: "text-ok" },
  skill_invoked: { icon: Sparkles, className: "text-accent" },
};

const SWATCHES = ["atmos-olive", "atmos-rust", "atmos-teal", "atmos-dusk"];

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

type RunFilter = "all" | FleetRunStatus;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, refetch, isFetching } = useFleetOverview();
  const [filter, setFilter] = useState<RunFilter>("all");

  const name = user?.name ?? (LIVE_MODE ? "" : CURRENT_USER.name);
  const greeting = `${greetingFor(new Date())}, ${firstNameOf(name)}.`;

  const filteredRuns = useMemo(
    () => (data?.runs ?? []).filter((r) => filter === "all" || r.status === filter),
    [data, filter],
  );

  const counts = useMemo(() => {
    const c: Record<FleetRunStatus, number> = { planning: 0, running: 0, awaiting_approval: 0, failed: 0 };
    for (const r of data?.runs ?? []) c[r.status] += 1;
    return c;
  }, [data]);

  const noProjects = LIVE_MODE && data && data.projectCount === 0;

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      {/* Greeting + launcher */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-headline text-ink">{greeting}</h1>
          {isLoading ? (
            <Skeleton className="mt-2 h-5 w-64" />
          ) : (
            <p className="mt-1.5 text-body text-muted">
              {data ? fleetSummaryLine(data.runs) : "Here is what your agents are working on."}
              {data && data.stats.pendingApprovals > 0 && (
                <>
                  {" · "}
                  <Link to="/approvals" className="text-ink underline-offset-4 hover:underline">
                    {data.stats.pendingApprovals} waiting on you
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <QuickLauncher />
      </div>

      {isError ? (
        <ErrorPanel onRetry={() => refetch()} retrying={isFetching} />
      ) : noProjects ? (
        <NoProjects />
      ) : (
        <>
          {/* Stat tiles */}
          <section aria-label="Fleet metrics" className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
            {isLoading || !data ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[116px] rounded-xl" />)
            ) : (
              <>
                <StatTile
                  icon={Activity}
                  label="Active runs"
                  value={data.stats.activeRuns}
                  delta={data.stats.activeRunsDelta ? signed(data.stats.activeRunsDelta) : undefined}
                  trend={trendOf(data.stats.activeRunsDelta)}
                  hint={data.stats.activeRunsDelta ? "vs yesterday" : undefined}
                />
                <StatTile
                  icon={Bot}
                  label="Agents working"
                  value={data.stats.agentsWorking}
                  delta={data.stats.agentsDelta ? signed(data.stats.agentsDelta) : undefined}
                  trend={trendOf(data.stats.agentsDelta)}
                  hint={data.stats.agentsDelta ? "vs 1h ago" : undefined}
                />
                <StatTile
                  icon={ShieldCheck}
                  label="Pending approvals"
                  value={data.stats.pendingApprovals}
                  hint={data.stats.pendingApprovals > 0 ? "needs you" : "all clear"}
                />
                <StatTile
                  icon={CircleDollarSign}
                  label="Spend today"
                  value={usd(data.stats.spendTodayUsd)}
                  suffix={data.stats.budgetUsd > 0 ? `/ ${usd(data.stats.budgetUsd).replace(/\.00$/, "")}` : undefined}
                  delta={data.stats.spendDeltaPct ? `${Math.abs(data.stats.spendDeltaPct)}%` : undefined}
                  trend={trendOf(data.stats.spendDeltaPct)}
                  invertTrend
                  hint={data.stats.spendDeltaPct ? "vs yesterday" : undefined}
                />
                <StatTile
                  icon={Sparkles}
                  label="Skills invoked (24h)"
                  value={data.stats.skillsInvoked24h}
                  delta={data.stats.skillsDelta ? signed(data.stats.skillsDelta) : undefined}
                  trend={trendOf(data.stats.skillsDelta)}
                  hint={data.stats.skillsDelta ? "vs prior 24h" : undefined}
                  className="col-span-2 md:col-span-1"
                />
              </>
            )}
          </section>

          {/* Two columns on xl; below that the wrappers dissolve (display: contents)
              so panels interleave by priority: runs, needs you, activity, gateway. */}
          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
            <section aria-labelledby="active-runs-heading" className="order-1 min-w-0 xl:order-none">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <h2 id="active-runs-heading" className="text-title text-ink">
                    Active runs
                  </h2>
                  {data && <span className="font-mono text-caption tabular-nums text-faint">{data.runs.length}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <SegmentedControl<RunFilter>
                    label="Filter runs by status"
                    value={filter}
                    onChange={setFilter}
                    className="max-w-full overflow-x-auto scrollbar-none"
                    options={[
                      { value: "all", label: "All" },
                      { value: "running", label: "Running", count: counts.running },
                      { value: "awaiting_approval", label: "Awaiting", count: counts.awaiting_approval },
                      { value: "planning", label: "Planning", count: counts.planning },
                    ]}
                  />
                  <Link
                    to="/projects"
                    className="hidden items-center gap-1 text-caption text-muted transition-colors hover:text-ink sm:inline-flex"
                  >
                    View all <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {isLoading || !data ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading runs">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] rounded-xl" />
                  ))}
                </div>
              ) : filteredRuns.length === 0 ? (
                <EmptyRuns filtered={filter !== "all"} onClear={() => setFilter("all")} />
              ) : (
                <ul className="space-y-3">
                  {filteredRuns.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      swatch={SWATCHES[(data?.runs.indexOf(run) ?? 0) % SWATCHES.length]}
                    />
                  ))}
                </ul>
              )}
            </section>
              <div className="order-3 min-w-0 xl:order-none">
                <RecentActivity events={data?.activity} loading={isLoading} />
              </div>
            </div>

            <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
              <div className="order-2 min-w-0 xl:order-none">
                <NeedsYou gates={data?.gates} loading={isLoading} />
              </div>
              <div className="order-4 min-w-0 xl:order-none">
                <GatewayPanel gateway={data?.gateway} loading={isLoading} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function signed(n: number) {
  return `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

function trendOf(n: number): "up" | "down" | "flat" {
  return n > 0 ? "up" : n < 0 ? "down" : "flat";
}

// ─── Quick launcher ─────────────────────────────────────────────────────────

function QuickLauncher() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = prompt.trim();
    navigate(q ? `/launch?prompt=${encodeURIComponent(q)}` : "/launch");
  };

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Start a new build"
      className="flex w-full items-center gap-2 rounded-pill border border-border bg-panel py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-ink/25 xl:max-w-[440px]"
    >
      <Rocket size={15} aria-hidden="true" className="shrink-0 text-faint" />
      <label htmlFor="cc-launch-prompt" className="sr-only">
        Describe what to build
      </label>
      <input
        id="cc-launch-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe what to build…"
        autoComplete="off"
        className="h-9 min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-faint focus:outline-none"
      />
      <Button type="submit" size="sm" variant="primary" aria-label="Start build" className="shrink-0">
        Build
        <ArrowUp size={14} aria-hidden="true" className="rotate-45" />
      </Button>
    </form>
  );
}

// ─── Run row ────────────────────────────────────────────────────────────────

function RunRow({ run, swatch }: { run: FleetRun; swatch: string }) {
  const meta = STATUS_META[run.status];
  return (
    <li>
      <Link
        to={run.href}
        className="group grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-panel p-3.5 transition-colors duration-fast hover:border-ink/20 hover:bg-panel-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-4 lg:grid-cols-[56px_minmax(0,1fr)_minmax(120px,168px)_auto]"
      >
        <span aria-hidden="true" className={clsx("atmos h-12 w-12 rounded-lg lg:h-14 lg:w-14", swatch)}>
          <span className="relative z-[1] flex h-full w-full items-end p-1.5 font-mono text-2xs text-ink/80">
            {run.projectName.charAt(0).toUpperCase()}
          </span>
        </span>

        <div className="min-w-0">
          <p className="truncate text-body font-medium text-ink">{run.title}</p>
          <p className="mt-0.5 truncate text-caption text-muted">{run.objective}</p>
          <p className="mt-1 truncate text-2xs font-normal text-faint">
            {run.projectName} · <span className="font-mono">{formatRelativeTime(run.startedAt)}</span>
          </p>
        </div>

        <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs tabular-nums text-ink">{Math.round(run.progress)}%</span>
            {/* Mobile: status sits on the progress line */}
            <Badge variant={meta.badge} size="sm" dot className="lg:hidden">
              {meta.label}
            </Badge>
          </div>
          <ProgressBar value={run.progress} tone={meta.tone} label={`${run.title} progress`} />
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-2xs tabular-nums text-faint">
              {run.totalTasks} tasks · {run.agents.length} agents
            </p>
            <AvatarStack items={run.agents.map((a) => ({ name: a.name }))} max={3} className="lg:hidden" />
          </div>
        </div>

        {/* Desktop: status + agents stacked on the right */}
        <div className="hidden w-[152px] flex-col items-end gap-2.5 lg:flex">
          <Badge variant={meta.badge} size="md" dot>
            {meta.label}
          </Badge>
          <AvatarStack items={run.agents.map((a) => ({ name: a.name }))} max={4} />
        </div>
      </Link>
    </li>
  );
}

function EmptyRuns({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
        <PlayCircle size={18} aria-hidden="true" />
      </span>
      <p className="text-body font-medium text-ink">{filtered ? "No runs match this filter" : "No runs in flight"}</p>
      <p className="mt-1 max-w-sm text-caption text-muted">
        {filtered
          ? "Try another status, or show every run."
          : "Describe what you want built and the agent fleet will plan and start a run."}
      </p>
      <div className="mt-4">
        {filtered ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Show all runs
          </Button>
        ) : (
          <Link
            to="/launch"
            className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-ink px-3.5 text-xs font-medium text-[rgb(var(--bg))] transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Rocket size={13} aria-hidden="true" /> New build
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Right column panels ────────────────────────────────────────────────────

function Panel({
  title,
  id,
  action,
  children,
  count,
}: {
  title: string;
  id: string;
  action?: ReactNode;
  children: ReactNode;
  count?: number;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-panel">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <h2 id={id} className="text-body font-medium text-ink">
            {title}
          </h2>
          {typeof count === "number" && count > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-accent/[0.12] px-1.5 font-mono text-2xs tabular-nums text-accent">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 pt-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 rounded-md" />
      ))}
    </div>
  );
}

function NeedsYou({ gates, loading }: { gates?: FleetGate[]; loading: boolean }) {
  const decide = useGateDecision();
  const pendingId = decide.isPending ? decide.variables?.gate.id : undefined;

  return (
    <Panel
      title="Needs you"
      id="needs-you-heading"
      count={gates?.length}
      action={
        <Link to="/approvals" className="text-caption text-muted transition-colors hover:text-ink">
          All approvals
        </Link>
      }
    >
      {loading || !gates ? (
        <PanelSkeleton rows={2} />
      ) : gates.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-caption text-muted">
          <Check size={14} aria-hidden="true" className="text-ok" />
          Nothing waiting on you. Agents are unblocked.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {gates.map((gate) => (
            <li key={gate.id} className="rounded-lg border border-border-soft bg-ink/[0.02] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-caption font-medium text-ink">{gate.gateName}</p>
                  <p className="truncate text-2xs text-faint">
                    {gate.projectName} · <span className="font-mono">{formatRelativeTime(gate.createdAt)}</span>
                  </p>
                </div>
                <Badge variant="warning" size="sm">
                  Gate
                </Badge>
              </div>
              <p className="mt-1.5 line-clamp-2 text-caption text-muted">{gate.reason}</p>
              <div className="mt-2.5 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="tonal"
                  loading={pendingId === gate.id && decide.variables?.decision === "approve"}
                  disabled={!!pendingId}
                  onClick={() => decide.mutate({ gate, decision: "approve" })}
                  aria-label={`Approve ${gate.gateName} for ${gate.projectName}`}
                >
                  <Check size={13} aria-hidden="true" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={pendingId === gate.id && decide.variables?.decision === "reject"}
                  disabled={!!pendingId}
                  onClick={() => decide.mutate({ gate, decision: "reject" })}
                  aria-label={`Reject ${gate.gateName} for ${gate.projectName}`}
                >
                  Reject
                </Button>
                <Link
                  to={`/approvals?gate=${encodeURIComponent(gate.id)}`}
                  aria-label={`Review ${gate.gateName} for ${gate.projectName}`}
                  className="ml-auto inline-flex items-center gap-1 rounded-xs text-xs text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Review <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
          {decide.isError && (
            <li role="alert" className="text-caption text-error">
              Couldn’t record that decision. Try again.
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function RecentActivity({ events, loading }: { events?: ActivityEvent[]; loading: boolean }) {
  return (
    <Panel title="Recent activity" id="recent-activity-heading">
      {loading || !events ? (
        <PanelSkeleton rows={4} />
      ) : events.length === 0 ? (
        <p className="py-2 text-caption text-muted">No activity yet. Runs, gates and skills will show up here.</p>
      ) : (
        <ol className="relative space-y-3.5 pt-1">
          <span aria-hidden="true" className="absolute bottom-2 left-[11px] top-3 w-px bg-border-soft" />
          {events.map((ev) => {
            const { icon: Icon, className } = ACTIVITY_ICONS[ev.kind];
            const body = (
              <>
                <span className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-soft bg-panel">
                  <Icon size={12} aria-hidden="true" className={className} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-muted">
                    <span className="font-medium text-ink">{ev.actor}</span> {ev.text}
                  </span>
                  <span className="block truncate text-2xs text-faint">
                    {ev.projectName} · <span className="font-mono">{formatRelativeTime(ev.at)}</span>
                  </span>
                </span>
              </>
            );
            return (
              <li key={ev.id}>
                {ev.href ? (
                  <Link
                    to={ev.href}
                    className="flex gap-3 rounded-md transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

const CIRCUIT_META = {
  closed: { label: "closed", dot: "bg-ok" },
  half_open: { label: "half-open", dot: "bg-warn" },
  open: { label: "open", dot: "bg-error" },
} as const;

function GatewayPanel({ gateway, loading }: { gateway?: GatewaySummary | null; loading: boolean }) {
  const localPct = gateway ? Math.round(gateway.localShare * 100) : 0;
  return (
    <Panel
      title="Model gateway"
      id="model-gateway-heading"
      action={
        <Link to="/models" className="text-caption text-muted transition-colors hover:text-ink">
          Manage
        </Link>
      }
    >
      {loading || gateway === undefined ? (
        <PanelSkeleton rows={3} />
      ) : gateway === null ? (
        <p className="flex items-start gap-2 py-2 text-caption text-muted">
          <Cpu size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-faint" />
          Provider health is visible to workspace admins.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border-soft">
            {gateway.providers.map((p) => {
              const circuit = p.healthy ? CIRCUIT_META[p.circuit] : CIRCUIT_META.open;
              return (
                <li key={p.name} className="flex items-center gap-2.5 py-2">
                  <span aria-hidden="true" className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", circuit.dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption capitalize text-ink">{p.name}</span>
                    {p.model && <span className="block truncate font-mono text-2xs text-faint">{p.model}</span>}
                  </span>
                  <span className="rounded-pill bg-ink/[0.06] px-2 py-0.5 text-2xs text-muted">{p.kind}</span>
                  <span className="w-[68px] text-right font-mono text-2xs text-faint">
                    <span className="sr-only">circuit </span>
                    {circuit.label}
                  </span>
                </li>
              );
            })}
            {gateway.providers.length === 0 && (
              <li className="flex items-center gap-2 py-2 text-caption text-muted">
                <AlertTriangle size={14} aria-hidden="true" className="text-warn" /> No providers configured.
              </li>
            )}
          </ul>
          <div className="mt-3 border-t border-border-soft pt-3">
            <div className="mb-2 flex items-center justify-between text-2xs text-faint">
              <span>Local vs cloud</span>
              <span className="font-mono tabular-nums">{gateway.calls24h.toLocaleString()} calls · 24h</span>
            </div>
            <div
              role="img"
              aria-label={`${localPct}% of model calls served locally, ${100 - localPct}% by cloud providers`}
              className="flex h-1.5 w-full overflow-hidden rounded-pill bg-ink/[0.08]"
            >
              <span className="h-full bg-accent" style={{ width: `${localPct}%` }} />
              <span className="h-full bg-ink/40" style={{ width: `${100 - localPct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-2xs tabular-nums">
              <span className="flex items-center gap-1.5 text-muted">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" /> Local {localPct}%
              </span>
              <span className="flex items-center gap-1.5 text-muted">
                Cloud {100 - localPct}% <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink/40" />
              </span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── Page-level states ──────────────────────────────────────────────────────

function ErrorPanel({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="mt-8 flex flex-col items-center rounded-xl border border-border bg-panel px-6 py-14 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-error/10 text-error">
        <AlertTriangle size={18} aria-hidden="true" />
      </span>
      <p className="text-body font-medium text-ink">Couldn’t load your fleet</p>
      <p className="mt-1 max-w-sm text-caption text-muted">
        The kernel didn’t respond. Your runs are still going; this view just can’t see them right now.
      </p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} loading={retrying}>
        <RefreshCw size={13} aria-hidden="true" /> Try again
      </Button>
    </div>
  );
}

function NoProjects() {
  return (
    <div className="mt-8 flex flex-col items-center rounded-xl border border-border bg-panel px-6 py-16 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
        <FolderPlus size={18} aria-hidden="true" />
      </span>
      <h2 className="text-title text-ink">No projects yet</h2>
      <p className="mt-1.5 max-w-md text-caption text-muted">
        Describe what you want to build above, or create a project. Runs, approvals and spend will
        appear here as soon as your agents start working.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <Link
          to="/launch"
          className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink px-4 text-sm font-medium text-[rgb(var(--bg))] transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Rocket size={14} aria-hidden="true" /> New build
        </Link>
        <Link
          to="/projects"
          className="inline-flex h-9 items-center rounded-pill border border-glass-border bg-glass px-4 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Projects
        </Link>
      </div>
    </div>
  );
}
