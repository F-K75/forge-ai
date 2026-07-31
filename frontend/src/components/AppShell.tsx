import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Store,
  CreditCard,
  Settings,
  ShieldCheck,
  Rocket,
  Zap,
  Minus,
  Square,
  X,
  Maximize2,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { CURRENT_USER } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { NotificationsBell } from "./NotificationsBell";
import { coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT } from "../lib/skillVisuals";
import { AGENTS } from "../lib/agents";

interface DockApp {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const DOCK_APPS: DockApp[] = [
  {
    to: "/projects",
    label: "Projects",
    icon: LayoutGrid,
    match: (p) => p === "/projects" || p.startsWith("/project/") || p.startsWith("/build/"),
  },
  {
    to: "/initiatives",
    label: "Initiatives",
    icon: Rocket,
    match: (p) => p.startsWith("/initiatives"),
  },
  {
    to: "/reviews",
    label: "Reviews",
    icon: ShieldCheck,
    match: (p) => p.startsWith("/reviews"),
  },
  {
    to: "/marketplace",
    label: "Marketplace",
    icon: Store,
    match: (p) => p.startsWith("/marketplace"),
  },
  {
    to: "/billing",
    label: "Billing",
    icon: CreditCard,
    match: (p) => p.startsWith("/billing"),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/settings"),
  },
];

const TICKER_BITS = [
  "SIX BUILD AGENTS ONLINE",
  "ELEVEN GATEWAY SKILLS MAPPED",
  "TWENTY-FIVE ORG ROLES READY",
  "TEN INTEGRATION PLAYBOOKS",
  "ENGINEERING OS · NOT A DASHBOARD",
  "PLAN → BUILD → VALIDATE → SHIP",
];

function windowTitle(pathname: string): string {
  if (pathname.startsWith("/initiatives/")) return "Initiative";
  if (pathname.startsWith("/initiatives")) return "Initiatives";
  if (pathname.startsWith("/reviews/")) return "Review";
  if (pathname.startsWith("/reviews")) return "Reviews";
  if (pathname.startsWith("/marketplace")) return "Marketplace";
  if (pathname.startsWith("/billing")) return "Billing";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/project/") && pathname.endsWith("/org")) return "Engineering Org";
  if (pathname.startsWith("/project/")) return "Build History";
  if (pathname.startsWith("/admin-console")) return "Admin Console";
  if (pathname.startsWith("/llm-management")) return "LLM Management";
  if (pathname.startsWith("/optimization-dashboard")) return "Optimization";
  if (pathname.startsWith("/engineering-health")) return "Engineering Health";
  if (pathname.startsWith("/prompt-studio")) return "Prompt Studio";
  if (pathname.startsWith("/projects")) return "Projects";
  return "Forge";
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function AppShell() {
  const { user } = useAuthStore();
  const { windowMaximized, toggleWindowMaximized } = useUiStore();
  const location = useLocation();
  const navigate = useNavigate();
  const clock = useClock();
  const stats = coverageStats();

  const name = LIVE_MODE ? user?.name ?? "" : CURRENT_USER.name;
  const plan = LIVE_MODE ? user?.plan ?? "free" : CURRENT_USER.plan;
  const creditsRemaining = LIVE_MODE
    ? user?.credits ?? 0
    : CURRENT_USER.creditsTotal - CURRENT_USER.creditsUsed;
  const title = useMemo(() => windowTitle(location.pathname), [location.pathname]);
  const initial = (name || "F").charAt(0).toUpperCase();

  return (
    <div className="os-desktop os-maximal relative h-[100dvh] overflow-hidden text-ink">
      <a
        href="#os-main"
        className="absolute left-3 top-3 z-[100] -translate-y-[200%] rounded-md bg-panel px-3 py-2 text-sm text-ink shadow-lg transition focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
      >
        Skip to main content
      </a>

      <div className="os-wallpaper pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="os-wallpaper-glow" />
        <div className="os-wallpaper-orb os-wallpaper-orb-a" />
        <div className="os-wallpaper-orb os-wallpaper-orb-b" />
        <div className="os-wallpaper-grain" />
        <div className="os-wallpaper-grid" />
        <div className="os-wallpaper-scan" />
        <p className="os-wallpaper-mark font-brand">FORGE</p>
        <div className="os-agent-constellation">
          {AGENTS.map((a, i) => (
            <span
              key={a.id}
              className="os-constellation-dot"
              style={{
                background: a.hue,
                // Spread agents around the wallpaper
                left: `${12 + i * 14}%`,
                top: `${18 + (i % 3) * 22}%`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </div>
      </div>

      <header className="os-menubar absolute inset-x-0 top-0 z-40 flex h-11 flex-col justify-center border-b-2 border-ember/30">
        <div className="flex items-center justify-between gap-3 px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-ember/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/50"
              aria-label="Forge home"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-ember to-ember-glow text-base shadow-[0_0_22px_-4px_rgba(232,130,60,1)]">
                <Zap size={12} className="text-base" aria-hidden="true" />
              </span>
              <span className="font-brand text-base font-bold tracking-tight text-ink uppercase">
                Forge
              </span>
              <span className="hidden border border-ember/50 bg-ember/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-ember sm:inline">
                OS MAX
              </span>
            </button>
            <span className="hidden h-4 w-px bg-ember/30 sm:block" aria-hidden="true" />
            <p className="hidden truncate font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink/80 sm:block">
              {title}
            </p>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="hidden rounded-sm border-2 border-ember/40 bg-ember/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-ember md:inline">
              {plan}
            </span>
            <span
              className="hidden rounded-sm border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-ink lg:inline"
              title="Credits remaining"
            >
              {creditsRemaining} CR
            </span>
            <span className="hidden rounded-sm border border-ok/30 bg-ok/10 px-2 py-0.5 font-mono text-[10px] text-ok xl:inline">
              {stats.full}/{stats.total} VISUALS
            </span>
            <NotificationsBell />
            <time
              dateTime={new Date().toISOString()}
              className="min-w-[3.25rem] text-right font-mono text-[11px] font-semibold tabular-nums text-ink"
            >
              {clock}
            </time>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="ml-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border-2 border-ember/50 bg-ember text-[11px] font-bold text-base transition-transform hover:scale-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/50"
              aria-label={`Account: ${name || "Settings"}`}
            >
              {initial}
            </button>
          </div>
        </div>
      </header>

      {/* Maximal ticker under menubar */}
      <div className="os-ticker absolute inset-x-0 top-11 z-30 overflow-hidden border-b border-white/10 bg-black/55" aria-hidden="true">
        <div className="os-ticker-track flex whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-ember/90">
          {[...TICKER_BITS, ...TICKER_BITS].map((bit, i) => (
            <span key={`${bit}-${i}`} className="mx-6 py-1">
              ◆ {bit} · {ORG_ROLE_COUNT} ORG · {PLAYBOOK_COUNT} PLAYBOOKS
            </span>
          ))}
        </div>
      </div>

      <div
        className={[
          "absolute inset-x-0 z-20 flex flex-col transition-[inset] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          windowMaximized
            ? "top-[4.25rem] bottom-[5.5rem] px-0 sm:bottom-[6rem]"
            : "top-[4.75rem] bottom-[6rem] px-2 sm:px-3 md:px-5 sm:bottom-[6.5rem]",
        ].join(" ")}
      >
        <section
          className={[
            "os-window relative flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-ember/25",
            windowMaximized ? "rounded-none border-x-0" : "rounded-xl",
          ].join(" ")}
          aria-label={`${title} window`}
        >
          <div className="os-titlebar flex h-12 shrink-0 items-center justify-between gap-3 border-b-2 border-ember/20 px-3 md:px-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <button
                  type="button"
                  onClick={() => navigate("/projects")}
                  className="os-traffic os-traffic-close cursor-pointer"
                  aria-label="Close to Projects"
                  title="Close"
                >
                  <X size={8} className="os-traffic-glyph" />
                </button>
                <button
                  type="button"
                  onClick={toggleWindowMaximized}
                  className="os-traffic os-traffic-min cursor-pointer"
                  aria-label={windowMaximized ? "Restore window" : "Minimize chrome"}
                  title={windowMaximized ? "Restore" : "Compact"}
                >
                  <Minus size={8} className="os-traffic-glyph" />
                </button>
                <button
                  type="button"
                  onClick={toggleWindowMaximized}
                  className="os-traffic os-traffic-max cursor-pointer"
                  aria-label={windowMaximized ? "Restore window" : "Maximize window"}
                  title={windowMaximized ? "Restore" : "Maximize"}
                >
                  {windowMaximized ? (
                    <Maximize2 size={7} className="os-traffic-glyph" />
                  ) : (
                    <Square size={7} className="os-traffic-glyph" />
                  )}
                </button>
              </div>
              <div className="ml-1 flex min-w-0 items-center gap-2">
                <span className="truncate font-display text-sm font-bold uppercase tracking-tight text-ink">
                  {title}
                </span>
                <span className="hidden border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-ember md:inline">
                  forge://{location.pathname.replace(/^\//, "") || "projects"}
                </span>
              </div>
            </div>
            <p className="hidden font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ember sm:block">
              Maximal Engineering OS
            </p>
          </div>

          <main id="os-main" className="os-window-body min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </section>
      </div>

      <nav
        className="os-dock absolute bottom-2 left-1/2 z-40 w-[min(720px,calc(100vw-1rem))] -translate-x-1/2 sm:bottom-3"
        aria-label="Application dock"
      >
        <ul className="os-dock-inner flex items-stretch justify-center gap-1 px-2 py-2 sm:gap-2 sm:px-3">
          {DOCK_APPS.map(({ to, label, icon: Icon, match }) => {
            const active = match(location.pathname);
            return (
              <li key={to} className="relative flex-1 sm:flex-none">
                <NavLink
                  to={to}
                  end={to === "/projects"}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "os-dock-item group relative flex h-[3.35rem] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-2 transition-transform duration-200 ease-out motion-reduce:transition-none sm:h-14 sm:w-[4.5rem]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50",
                    active
                      ? "bg-ember text-base shadow-[0_0_28px_-8px_rgba(232,130,60,0.95)]"
                      : "bg-white/[0.06] text-ink hover:bg-white/[0.12] hover:-translate-y-1 active:translate-y-0",
                  ].join(" ")}
                >
                  <Icon size={18} strokeWidth={2.25} aria-hidden="true" />
                  <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.08em]">
                    {label}
                  </span>
                </NavLink>
                {active && (
                  <span
                    className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-ember-glow"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
