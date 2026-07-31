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

  const name = LIVE_MODE ? user?.name ?? "" : CURRENT_USER.name;
  const plan = LIVE_MODE ? user?.plan ?? "free" : CURRENT_USER.plan;
  const creditsRemaining = LIVE_MODE ? user?.credits ?? 0 : CURRENT_USER.creditsTotal - CURRENT_USER.creditsUsed;
  const title = useMemo(() => windowTitle(location.pathname), [location.pathname]);
  const initial = (name || "F").charAt(0).toUpperCase();

  return (
    <div className="os-desktop relative h-[100dvh] overflow-hidden text-ink">
      <a
        href="#os-main"
        className="absolute left-3 top-3 z-[100] -translate-y-[200%] rounded-md bg-panel px-3 py-2 text-sm text-ink shadow-lg transition focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
      >
        Skip to main content
      </a>

      {/* Wallpaper — atmospheric plane, not flat dashboard fill */}
      <div className="os-wallpaper pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="os-wallpaper-glow" />
        <div className="os-wallpaper-grain" />
        <div className="os-wallpaper-grid" />
      </div>

      {/* Menu bar */}
      <header className="os-menubar absolute inset-x-0 top-0 z-40 flex h-10 items-center justify-between gap-3 px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="group flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/50"
            aria-label="Forge home"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-gradient-to-br from-ember to-ember-glow text-base shadow-[0_0_18px_-6px_rgba(232,130,60,0.85)]">
              <Zap size={11} className="text-base" aria-hidden="true" />
            </span>
            <span className="font-brand text-[15px] font-semibold tracking-tight text-ink">
              Forge
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-faint sm:inline">
              OS
            </span>
          </button>
          <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden="true" />
          <p className="hidden truncate text-xs text-muted sm:block">{title}</p>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <span className="hidden rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted md:inline">
            {plan}
          </span>
          <span
            className="hidden rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-muted lg:inline"
            title="Credits remaining"
          >
            {creditsRemaining} cr
          </span>
          <NotificationsBell />
          <time
            dateTime={new Date().toISOString()}
            className="min-w-[3.25rem] text-right font-mono text-[11px] tabular-nums text-muted"
          >
            {clock}
          </time>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="ml-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/12 bg-panel text-[11px] font-medium text-ink transition-colors hover:border-ember/40 hover:text-ember focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/50"
            aria-label={`Account: ${name || "Settings"}`}
          >
            {initial}
          </button>
        </div>
      </header>

      {/* Active application window */}
      <div
        className={[
          "absolute inset-x-0 z-20 flex flex-col transition-[inset] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          windowMaximized
            ? "top-10 bottom-[4.75rem] px-0 sm:bottom-[5.25rem]"
            : "top-12 bottom-[5.25rem] px-2 sm:px-4 md:px-6 lg:px-8 sm:bottom-[5.75rem]",
        ].join(" ")}
      >
        <section
          className={[
            "os-window relative flex min-h-0 flex-1 flex-col overflow-hidden",
            windowMaximized ? "rounded-none border-x-0" : "rounded-2xl",
          ].join(" ")}
          aria-label={`${title} window`}
        >
          <div className="os-titlebar flex h-11 shrink-0 items-center justify-between gap-3 px-3 md:px-4">
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
                <span className="truncate font-display text-[13px] font-medium tracking-tight text-ink/90">
                  {title}
                </span>
                <span className="hidden font-mono text-[10px] text-faint md:inline">
                  forge://{location.pathname.replace(/^\//, "") || "projects"}
                </span>
              </div>
            </div>
            <p className="hidden text-[10px] uppercase tracking-[0.14em] text-faint sm:block">
              Engineering OS
            </p>
          </div>

          <main id="os-main" className="os-window-body min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </section>
      </div>

      {/* Dock */}
      <nav
        className="os-dock absolute bottom-3 left-1/2 z-40 -translate-x-1/2 sm:bottom-4"
        aria-label="Application dock"
      >
        <ul className="os-dock-inner flex items-end gap-1 px-2 py-2 sm:gap-1.5 sm:px-2.5">
          {DOCK_APPS.map(({ to, label, icon: Icon, match }) => {
            const active = match(location.pathname);
            return (
              <li key={to} className="relative">
                <NavLink
                  to={to}
                  end={to === "/projects"}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "os-dock-item group relative flex h-11 w-11 cursor-pointer flex-col items-center justify-center rounded-[14px] transition-transform duration-200 ease-out motion-reduce:transition-none sm:h-12 sm:w-12",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50",
                    active
                      ? "bg-white/[0.12] text-ink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-muted hover:bg-white/[0.08] hover:text-ink hover:-translate-y-1 active:translate-y-0",
                  ].join(" ")}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-panel px-2 py-0.5 text-[10px] text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
                    {label}
                  </span>
                </NavLink>
                {active && (
                  <span
                    className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ember"
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
