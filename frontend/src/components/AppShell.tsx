import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Store,
  CreditCard,
  Settings,
  ShieldCheck,
  Rocket,
  Shield,
  Brain,
  TrendingUp,
  Heart,
  Terminal,
  Activity,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useAuthStore } from "../store/authStore";
import { CURRENT_USER } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";
import BrandLogo from "./BrandLogo";
import { AgentFleetGraph } from "./AgentFleetGraph";
import { CommandPalette } from "./CommandPalette";
import { Badge } from "./ui";

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
    to: "/flow",
    label: "Flow",
    icon: Workflow,
    match: (p) => p === "/flow",
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
];

interface AccountApp extends DockApp {
  adminOnly?: boolean;
}

const ACCOUNT_APPS: AccountApp[] = [
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
  {
    to: "/admin-console",
    label: "Admin",
    icon: Shield,
    match: (p) => p.startsWith("/admin-console"),
    adminOnly: true,
  },
  {
    to: "/llm-management",
    label: "LLM",
    icon: Brain,
    match: (p) => p.startsWith("/llm-management"),
    adminOnly: true,
  },
  {
    to: "/optimization-dashboard",
    label: "Optimization",
    icon: TrendingUp,
    match: (p) => p.startsWith("/optimization-dashboard"),
    adminOnly: true,
  },
  {
    to: "/engineering-health",
    label: "Health",
    icon: Heart,
    match: (p) => p.startsWith("/engineering-health"),
    adminOnly: true,
  },
  {
    to: "/prompt-studio",
    label: "Prompts",
    icon: Terminal,
    match: (p) => p.startsWith("/prompt-studio"),
    adminOnly: true,
  },
];

function windowTitle(pathname: string): string {
  if (pathname.startsWith("/flow")) return "Flow";
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

export default function AppShell() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [showAgentFleet, setShowAgentFleet] = useState(false);

  const name = LIVE_MODE ? user?.name ?? "" : CURRENT_USER.name;
  const plan = LIVE_MODE ? user?.plan ?? "free" : CURRENT_USER.plan;
  const creditsRemaining = LIVE_MODE
    ? user?.credits ?? 0
    : CURRENT_USER.creditsTotal - CURRENT_USER.creditsUsed;
  const title = useMemo(() => windowTitle(location.pathname), [location.pathname]);
  const initial = (name || "F").charAt(0).toUpperCase();

  useEffect(() => {
    const main = document.getElementById("apple-main");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 8);
    main.addEventListener("scroll", onScroll);
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="apple-shell relative flex h-[100dvh] flex-col overflow-hidden text-ink">
      <a
        href="#apple-main"
        className="absolute left-4 top-4 z-[100] -translate-y-[200%] rounded-full bg-panel px-4 py-2 text-sm text-ink shadow-apple transition focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Skip to main content
      </a>

      <header
        className={[
          "apple-shell-nav relative z-40 mx-3 mt-3 rounded-apple-lg px-4 py-2.5 sm:mx-5 sm:px-5 transition-all duration-300",
          scrolled ? "apple-glass-strong shadow-apple" : "apple-glass",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-content items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="group flex items-center gap-2.5 rounded-full pr-2 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Home"
            >
              <BrandLogo size="md" />
              <span className="font-brand text-[17px] font-semibold tracking-tight text-ink">
                Forge
              </span>
            </button>
            <span className="hidden h-4 w-px bg-inlay-hover sm:block" aria-hidden="true" />
            <p className="hidden truncate text-[15px] font-medium text-muted sm:block">{title}</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Badge variant="outlined" size="sm" className="hidden font-mono md:inline-flex">
              {creditsRemaining} credits
            </Badge>
            <Badge variant="default" size="sm" className="hidden md:inline-flex">
              {plan}
            </Badge>
            <ThemeToggle compact />
            <NotificationsBell />
            <button
              type="button"
              onClick={() => setShowAgentFleet(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-alt text-xs font-semibold text-ink transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Agent fleet"
            >
              <Activity size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white shadow-m3 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Settings"
            >
              {initial}
            </button>
          </div>
        </div>
      </header>

      <main
        id="apple-main"
        className="relative z-10 flex-1 overflow-y-auto pb-28"
      >
        <motion.div
          key={location.pathname}
          className="h-full"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>

      <nav
        aria-label="Primary"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-4 sm:pb-5"
      >
        <ul className="apple-dock pointer-events-auto flex items-end gap-1 rounded-apple-xl px-2 py-2 sm:gap-1.5 sm:px-3">
          {DOCK_APPS.map((app) => {
            const active = app.match(location.pathname);
            return (
              <NavLink
                key={app.to}
                to={app.to}
                className={[
                  "apple-dock-item flex min-w-[3.25rem] flex-col items-center gap-1 rounded-2xl px-2.5 py-2 text-muted sm:min-w-[4.25rem]",
                  active ? "is-active" : "",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <app.icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="text-[10px] font-medium tracking-wide">{app.label}</span>
              </NavLink>
            );
          })}

          <li
            role="separator"
            aria-orientation="vertical"
            aria-hidden="true"
            className="mx-1 my-2 w-px self-stretch rounded bg-border-soft sm:mx-2"
          />

          {ACCOUNT_APPS.filter((app) => !app.adminOnly || user?.is_admin).map((app) => {
            const active = app.match(location.pathname);
            return (
              <NavLink
                key={app.to}
                to={app.to}
                className={[
                  "apple-dock-item flex min-w-[3.25rem] flex-col items-center gap-1 rounded-2xl px-2.5 py-2 text-muted sm:min-w-[4.25rem]",
                  active ? "is-active" : "",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <app.icon size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="text-[10px] font-medium tracking-wide">{app.label}</span>
              </NavLink>
            );
          })}
        </ul>
      </nav>

      {showAgentFleet && (
        <AgentFleetGraph onClose={() => setShowAgentFleet(false)} />
      )}
      <CommandPalette />
    </div>
  );
}
