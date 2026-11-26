import React from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { ChevronRight, Menu, Search, X } from "lucide-react";
import { useSwitcherProjects, projectNameFrom } from "../hooks/useSwitcherProjects";
import { projectIdFromPath } from "../hooks/useActiveProject";
import { openCommandPalette } from "../lib/commandPalette";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";

export interface TopNavBarProps {
  onOpenAgentFleet?: () => void;
  activeAgentCount?: number;
  creditsBalance?: number;
  onToggleMobileNav?: () => void;
  mobileNavOpen?: boolean;
}

interface Crumb {
  label: string;
  to?: string;
}

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/command/, "Command Center"],
  [/^\/projects/, "Projects"],
  [/^\/launch/, "New Build"],
  [/^\/approvals/, "Approvals"],
  [/^\/agents/, "Agents"],
  [/^\/skills/, "Skills"],
  [/^\/protocols/, "Protocols"],
  [/^\/marketplace/, "Marketplace"],
  [/^\/billing/, "Billing"],
  [/^\/settings/, "Settings"],
  [/^\/admin/, "Admin Ops"],
  [/^\/studio-3d/, "3D Studio"],
  [/^\/reviews/, "Reviews"],
  [/^\/initiatives/, "Plan"],
];

const PROJECT_SECTIONS: Record<string, string> = {
  workspace: "Build",
  initiatives: "Plan",
  agents: "Agents",
  flow: "Agents",
  reviews: "Reviews",
  files: "Files",
  history: "History",
  settings: "Project Settings",
};

/** Breadcrumb trail for the current route. */
function useBreadcrumbs(): Crumb[] {
  const { pathname, search } = useLocation();
  const projects = useSwitcherProjects();
  const projectId = projectIdFromPath(pathname);

  if (projectId && pathname.startsWith("/p/")) {
    const section = pathname.split("/")[3] ?? "workspace";
    const crumbs: Crumb[] = [
      { label: "Projects", to: "/projects" },
      { label: projectNameFrom(projects, projectId) ?? projectId, to: `/p/${projectId}/workspace` },
    ];
    crumbs.push({ label: PROJECT_SECTIONS[section] ?? section });
    return crumbs;
  }
  if (pathname === "/admin" && search.includes("tab=llm")) return [{ label: "Models" }];
  const match = PAGE_TITLES.find(([re]) => re.test(pathname));
  return [{ label: match ? match[1] : "Forge" }];
}

/**
 * Slim context bar above page content: breadcrumbs on the left; credits, fleet
 * status, notifications and theme on the right. Navigation lives in the sidebar.
 */
export const TopNavBar: React.FC<TopNavBarProps> = ({
  onOpenAgentFleet,
  activeAgentCount = 3,
  creditsBalance = 1247,
  onToggleMobileNav,
  mobileNavOpen = false,
}) => {
  const crumbs = useBreadcrumbs();
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-base";

  return (
    <header
      id="os-menubar"
      className="z-40 flex h-14 shrink-0 select-none items-center justify-between gap-3 border-b border-border-soft bg-base/80 px-3 backdrop-blur-md sm:px-6"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label="Toggle Navigation Drawer"
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav-drawer"
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-ink/[0.06] hover:text-ink md:hidden",
            focusRing,
          )}
        >
          {mobileNavOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-caption">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li
                  key={`${crumb.label}-${i}`}
                  className={clsx("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}
                >
                  {crumb.to && !last ? (
                    <Link
                      to={crumb.to}
                      className={clsx("truncate rounded-xs text-faint transition-colors hover:text-ink", focusRing)}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={last ? "page" : undefined}
                      className={clsx("truncate", last ? "font-medium text-ink" : "text-faint")}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!last && <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-faint" />}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          id="os-terminal-trigger"
          onClick={openCommandPalette}
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-pill text-muted transition-colors duration-fast hover:bg-ink/[0.06] hover:text-ink md:hidden",
            focusRing,
          )}
          title="Search (⌘K)"
        >
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search (⌘K)</span>
        </button>

        <button
          type="button"
          id="os-agent-fleet-trigger"
          onClick={() => onOpenAgentFleet?.()}
          aria-label={`Agent fleet: ${activeAgentCount} agents working. Open fleet topology`}
          className={clsx(
            "flex h-8 items-center gap-2 rounded-pill border border-glass-border bg-glass px-3 text-xs text-muted transition-colors duration-fast hover:bg-ink/10 hover:text-ink",
            focusRing,
          )}
        >
          <span aria-hidden="true" className="relative flex h-2 w-2">
            {activeAgentCount > 0 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
            )}
            <span className={clsx("relative inline-flex h-2 w-2 rounded-full", activeAgentCount > 0 ? "bg-ok" : "bg-faint")} />
          </span>
          <span className="font-mono tabular-nums text-ink">{activeAgentCount}</span>
          <span className="hidden lg:inline">agents working</span>
        </button>

        <Link
          to="/billing"
          id="os-credits-chip"
          aria-label={`${creditsBalance.toLocaleString()} credits remaining. Open billing`}
          className={clsx(
            "hidden h-8 items-center gap-1.5 rounded-pill border border-glass-border bg-glass px-3 font-mono text-xs tabular-nums text-ink transition-colors duration-fast hover:bg-ink/10 sm:flex",
            focusRing,
          )}
        >
          <span>{creditsBalance.toLocaleString()}</span>
          <span className="text-faint">CR</span>
        </Link>

        <NotificationsBell />
        <ThemeToggle compact />
      </div>
    </header>
  );
};

export default TopNavBar;
