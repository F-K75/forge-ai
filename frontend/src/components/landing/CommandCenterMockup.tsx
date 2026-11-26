import {
  Bot,
  Boxes,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  Network,
  Plug,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { StepId } from "./landingContent";
import { atmosphere } from "./atmosphere";

/**
 * A static, illustrative rendering of the Forge Command Center, built in JSX
 * so it stays crisp at every size. The data is sample data for the mockup.
 */

const NAV: { icon: LucideIcon; label: string }[] = [
  { icon: LayoutDashboard, label: "Command Center" },
  { icon: FolderKanban, label: "Projects" },
  { icon: Plus, label: "New Build" },
  { icon: ShieldCheck, label: "Approvals" },
];
const NAV_ORG: { icon: LucideIcon; label: string }[] = [
  { icon: Bot, label: "Agents" },
  { icon: Sparkles, label: "Skills" },
  { icon: Plug, label: "Protocols" },
  { icon: Boxes, label: "Marketplace" },
];

const RUNS: {
  step: StepId;
  title: string;
  sub: string;
  pct: number;
  meta: string;
  status: string;
  tone: "ok" | "info" | "warn" | "accent";
  hue: "olive" | "teal" | "rust";
  agents: string[];
}[] = [
  {
    step: "plan",
    title: "Billing portal",
    sub: "Architect drafting the task graph",
    pct: 28,
    meta: "14 tasks · 3 agents",
    status: "Planning",
    tone: "accent",
    hue: "olive",
    agents: ["PL", "AR", "DS"],
  },
  {
    step: "build",
    title: "Mobile onboarding",
    sub: "Frontend and Backend in 2 worktrees",
    pct: 64,
    meta: "22 tasks · 4 agents",
    status: "Building",
    tone: "info",
    hue: "teal",
    agents: ["FE", "BE", "AI"],
  },
  {
    step: "verify",
    title: "Search API v2",
    sub: "QA running 312 tests, Security review",
    pct: 86,
    meta: "9 tasks · 2 agents",
    status: "Verifying",
    tone: "ok",
    hue: "rust",
    agents: ["QA", "SE"],
  },
  {
    step: "ship",
    title: "Release 2.4",
    sub: "Waiting at the production gate",
    pct: 97,
    meta: "6 tasks · 2 agents",
    status: "Needs approval",
    tone: "warn",
    hue: "olive",
    agents: ["RL", "DO"],
  },
];

const TONE: Record<(typeof RUNS)[number]["tone"], { bar: string; pill: string }> = {
  ok: { bar: "bg-ok", pill: "bg-ok/10 text-ok" },
  info: { bar: "bg-info", pill: "bg-info/10 text-info" },
  warn: { bar: "bg-warn", pill: "bg-warn/10 text-warn" },
  accent: { bar: "bg-accent", pill: "bg-accent/[0.12] text-accent" },
};

function Stat({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border-soft bg-ink/[0.02] p-2.5 sm:p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink/[0.06] sm:flex">
          <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        </span>
        <span className="truncate whitespace-nowrap text-[11px] text-muted">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[22px] leading-none tabular-nums text-ink">{value}</span>
        <span className="whitespace-nowrap font-mono text-[10px] text-ok">↑ {delta}</span>
      </div>
    </div>
  );
}

export function CommandCenterMockup({ active }: { active: StepId }) {
  return (
    <div
      className="flex h-full min-h-[460px] overflow-hidden rounded-xl border border-border bg-base/90 text-left shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]"
      role="img"
      aria-label="Illustrative mockup of the Forge Command Center showing four active agent runs"
    >
      {/* Sidebar */}
      <div className="hidden w-[188px] shrink-0 flex-col border-r border-border-soft p-3 md:flex" aria-hidden="true">
        <div className="flex items-center gap-2 px-1.5 py-1">
          <img src="/forge.svg" alt="" className="h-4 w-4" />
          <span className="text-[12px] font-medium tracking-[-0.01em] text-ink">Forge AI</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 rounded-md border border-border-soft bg-ink/[0.03] px-2 py-1.5 text-[10px] text-muted">
          <Search className="h-3 w-3" />
          <span className="flex-1">Search</span>
          <span className="font-mono">⌘K</span>
        </div>
        <div className="mt-3 space-y-0.5">
          {NAV.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                i === 0 ? "bg-ink/[0.06] text-ink" : "text-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {label === "Approvals" && (
                <span className="ml-auto rounded-pill bg-accent/[0.12] px-1.5 font-mono text-[9px] text-accent">1</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 px-2 text-[10px] text-muted">Organisation</p>
        <div className="mt-1 space-y-0.5">
          {NAV_ORG.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-0.5 pt-4">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border-soft p-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/[0.08] text-[9px] font-medium text-ink">
              AK
            </span>
            <div className="leading-tight">
              <div className="text-[10px] text-ink">Alex Kim</div>
              <div className="text-[9px] text-muted">Engineering lead</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="min-w-0 flex-1 p-4 sm:p-5" aria-hidden="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[17px] font-medium tracking-[-0.02em] text-ink sm:text-[19px]">Good morning, Alex.</div>
            <div className="mt-0.5 text-[11px] text-muted">Your agents shipped 3 changes overnight.</div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-pill bg-accent/[0.12] px-2 py-0.5 text-[10px] text-accent sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
            Live
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={Network} label="Active runs" value="4" delta="2" />
          <Stat icon={CheckCircle2} label="Tasks done" value="128" delta="31" />
          <Stat icon={ShieldCheck} label="Approvals" value="1" delta="1" />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink">Active runs</span>
          <span className="text-[10px] text-muted">View all →</span>
        </div>
        <div className="mt-2 space-y-2">
          {RUNS.map((r) => {
            const on = r.step === active;
            const tone = TONE[r.tone];
            return (
              <div
                key={r.title}
                className={`grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-lg border p-2.5 transition-all duration-slow sm:grid-cols-[36px_minmax(0,1fr)_minmax(0,190px)_104px] ${
                  on ? "border-ink/20 bg-ink/[0.05]" : "border-border-soft bg-transparent opacity-70"
                }`}
              >
                <span className="h-9 w-9 rounded-md border border-border-soft" style={{ background: atmosphere(r.hue, "30% 20%", 1) }} />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-ink">{r.title}</div>
                  <div className="truncate text-[10px] text-muted">{r.sub}</div>
                </div>
                <div className="hidden min-w-0 sm:block">
                  <div className="font-mono text-[10px] tabular-nums text-ink">{r.pct}%</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/[0.08]">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${r.pct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[9px] text-muted">{r.meta}</span>
                    <span className="flex -space-x-1">
                      {r.agents.map((a) => (
                        <span
                          key={a}
                          className="flex h-4 w-4 items-center justify-center rounded-full border border-base bg-surface-high font-mono text-[6px] text-ink"
                        >
                          {a}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
                <span className={`justify-self-end whitespace-nowrap rounded-pill px-2 py-0.5 text-[10px] ${tone.pill}`}>{r.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
