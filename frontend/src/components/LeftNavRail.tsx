import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  FolderGit2,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Network,
  Users,
  Rocket,
  Boxes,
  CreditCard,
  Settings,
  Shield,
  Terminal,
  Layers,
  Bot,
  GitCompare,
  Clock,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Brain,
  FolderTree,
  Box,
  HelpCircle,
  ChevronsUpDown,
  ChevronUp,
  Plus,
  Check,
  LogOut,
  Home,
  X,
  type LucideIcon,
} from "lucide-react";
import { useActiveProject } from "../hooks/useActiveProject";
import { useFleetOverview } from "../hooks/useFleetOverview";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { LIVE_MODE } from "../lib/env";
import { CURRENT_USER } from "../lib/mockData";
import { openCommandPalette } from "../lib/commandPalette";
import { useSwitcherProjects } from "../hooks/useSwitcherProjects";
import { Avatar } from "./ui/Avatar";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import BrandLogo from "./BrandLogo";

export interface LeftNavRailProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface RailNavItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  count?: number;
}

interface RailNavGroup {
  id: string;
  label: string;
  items: RailNavItem[];
}

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K", "Search and run commands"],
  ["⌥C", "Command Center"],
  ["⌥1", "Projects"],
  ["⌥L", "New Build"],
  ["⌥2", "Build (current project)"],
  ["⌥3", "Agents (current project)"],
  ["⌥4", "Plan (current project)"],
  ["⌥5", "Reviews (current project)"],
  ["⌥7", "Files (current project)"],
  ["⌥8", "History (current project)"],
  ["⌥6", "Marketplace"],
  ["⌥9", "Models"],
  ["⌥0", "Billing"],
];

export const LeftNavRail: React.FC<LeftNavRailProps> = ({
  mobileOpen = false,
  onCloseMobile,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((st) => st.user);
  const logout = useAuthStore((st) => st.logout);
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { activeProject, activeProjectId, projectPath } = useActiveProject();
  const switcherProjects = useSwitcherProjects();
  const { data: fleet } = useFleetOverview();

  const [switcherOpen, setSwitcherOpen] = useState<false | "desktop" | "mobile">(false);
  const [switcherFilter, setSwitcherFilter] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState<false | "desktop" | "mobile">(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const isAdmin = !LIVE_MODE || user?.is_admin === true;
  const displayName = user?.name ?? (LIVE_MODE ? "Developer" : CURRENT_USER.name);
  const planLabel = user?.plan
    ? user.plan[0].toUpperCase() + user.plan.slice(1)
    : LIVE_MODE
      ? "Free"
      : CURRENT_USER.plan;
  const roleLabel = isAdmin ? "Admin" : "Member";
  const pendingApprovals = fleet?.stats.pendingApprovals ?? 0;

  const activeProjectName =
    switcherProjects.find((p) => p.id === activeProjectId)?.name ??
    activeProject?.name ??
    activeProjectId ??
    "No project";

  const prevPathnameRef = useRef(location.pathname);

  // Close the mobile drawer and any popovers only when the route actually changes.
  useEffect(() => {
    if (prevPathnameRef.current !== location.pathname) {
      prevPathnameRef.current = location.pathname;
      setSwitcherOpen(false);
      setUserMenuOpen(false);
      if (mobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    }
  }, [location.pathname, mobileOpen, onCloseMobile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (switcherOpen || userMenuOpen) {
        setSwitcherOpen(false);
        setUserMenuOpen(false);
        return;
      }
      if (mobileOpen && onCloseMobile) onCloseMobile();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, onCloseMobile, switcherOpen, userMenuOpen]);

  const groups: RailNavGroup[] = [
    {
      id: "workspace",
      label: "Workspace",
      items: [
        { id: "command", to: "/command", label: "Command Center", icon: LayoutDashboard, match: (p) => p === "/command" },
        { id: "projects", to: "/projects", label: "Projects", icon: FolderGit2, match: (p) => p === "/projects" },
        { id: "new-build", to: "/launch", label: "New Build", icon: Rocket, match: (p) => p === "/launch" },
        {
          id: "approvals",
          to: "/approvals",
          label: "Approvals",
          icon: ShieldCheck,
          match: (p) => p.startsWith("/approvals"),
          count: pendingApprovals,
        },
      ],
    },
    {
      id: "engineering",
      label: "Engineering org",
      items: [
        { id: "org", to: "/agents", label: "Agents", icon: Users, match: (p) => p === "/agents" },
        { id: "skills", to: "/skills", label: "Skills", icon: Sparkles, match: (p) => p.startsWith("/skills") },
        { id: "protocols", to: "/protocols", label: "Protocols", icon: Network, match: (p) => p.startsWith("/protocols") },
        {
          id: "models",
          to: "/models",
          label: "Models",
          icon: Brain,
          match: (p) => p === "/models" || (p === "/admin" && location.search.includes("tab=llm")),
        },
        { id: "studio-3d", to: "/studio-3d", label: "3D Studio", icon: Box, match: (p) => p === "/studio-3d" },
      ],
    },
    ...(activeProjectId
      ? [
          {
            id: "project",
            label: activeProjectName,
            items: [
              {
                id: "build",
                to: projectPath("workspace"),
                label: "Build",
                icon: Terminal,
                match: (p: string) =>
                  (p.startsWith("/p/") && p.includes("/workspace")) || p.startsWith("/build/") || p === "/workspace",
              },
              { id: "plan", to: projectPath("initiatives"), label: "Plan", icon: Layers, match: (p: string) => p.includes("/initiatives") },
              {
                id: "agents",
                to: projectPath("agents"),
                label: "Agents",
                icon: Bot,
                match: (p: string) => p.startsWith("/p/") && (p.endsWith("/agents") || p.endsWith("/flow")),
              },
              { id: "reviews", to: projectPath("reviews"), label: "Reviews", icon: GitCompare, match: (p: string) => p.includes("/reviews") },
              { id: "files", to: projectPath("files"), label: "Files", icon: FolderTree, match: (p: string) => p.startsWith("/p/") && p.endsWith("/files") },
              { id: "history", to: projectPath("history"), label: "History", icon: Clock, match: (p: string) => p.includes("/history") },
              {
                id: "project-settings",
                to: projectPath("settings"),
                label: "Project Settings",
                icon: SlidersHorizontal,
                match: (p: string) => p.startsWith("/p/") && p.endsWith("/settings"),
              },
            ] as RailNavItem[],
          },
        ]
      : []),
    {
      id: "account",
      label: "Account",
      items: [
        { id: "marketplace", to: "/marketplace", label: "Marketplace", icon: Boxes, match: (p) => p.startsWith("/marketplace") },
        { id: "billing", to: "/billing", label: "Billing", icon: CreditCard, match: (p) => p.startsWith("/billing") },
        { id: "settings", to: "/settings", label: "Settings", icon: Settings, match: (p) => p === "/settings" },
        ...(isAdmin
          ? [
              {
                id: "admin-ops",
                to: "/admin",
                label: "Admin Ops",
                icon: Shield,
                match: (p: string) => p.startsWith("/admin") && !location.search.includes("tab=llm"),
              },
            ]
          : []),
      ],
    },
  ];

  const switchProject = (projectId: string) => {
    setSwitcherOpen(false);
    setSwitcherFilter("");
    try {
      localStorage.setItem("forge_last_project", projectId);
    } catch {
      // ignore storage errors
    }
    if (location.pathname.startsWith("/p/")) {
      const subPath = location.pathname.split("/").slice(3).join("/");
      navigate(`/p/${projectId}/${subPath || "workspace"}`);
    } else {
      navigate(`/p/${projectId}/workspace`);
    }
  };

  const filteredProjects = switcherFilter.trim()
    ? switcherProjects.filter((p) =>
        `${p.name} ${p.id} ${p.description}`.toLowerCase().includes(switcherFilter.toLowerCase()),
      )
    : switcherProjects;

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";

  const renderNavItem = (item: RailNavItem, collapsed: boolean, isMobile: boolean) => {
    const isActive = item.match(location.pathname);
    const Icon = item.icon;
    const hasCount = typeof item.count === "number" && item.count > 0;
    const accessibleLabel = hasCount ? `${item.label}, ${item.count} pending` : item.label;
    return (
      <Link
        key={item.id}
        to={item.to}
        id={`rail-nav-${item.id}${isMobile ? "-mobile" : ""}`}
        aria-label={collapsed || hasCount ? accessibleLabel : undefined}
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        onClick={isMobile && onCloseMobile ? onCloseMobile : undefined}
        className={clsx(
          "group relative flex items-center rounded-md text-caption font-medium transition-colors duration-fast",
          focusRing,
          isMobile ? "min-h-[44px] gap-3 px-3" : collapsed ? "mx-auto h-9 w-9 justify-center" : "h-8 gap-2.5 px-2.5",
          isActive ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
        )}
      >
        {isActive && (
          <span aria-hidden="true" className="absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-pill bg-accent" />
        )}
        <Icon
          size={16}
          aria-hidden="true"
          className={clsx("shrink-0 transition-colors duration-fast", isActive ? "text-ink" : "text-faint group-hover:text-ink")}
        />
        {(!collapsed || isMobile) && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {hasCount && (!collapsed || isMobile) && (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-accent/[0.12] px-1.5 font-mono text-2xs tabular-nums text-accent"
          >
            {item.count}
          </span>
        )}
        {hasCount && collapsed && !isMobile && (
          <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />
        )}
      </Link>
    );
  };

  const renderSwitcher = (collapsed: boolean, isMobile: boolean) => {
    const variant = isMobile ? "mobile" : "desktop";
    const open = switcherOpen === variant;
    const initial = (activeProjectName || "P").charAt(0).toUpperCase();
    return (
      <div className="relative">
        <button
          type="button"
          id={isMobile ? "sidebar-project-switcher-btn-mobile" : "sidebar-project-switcher-btn"}
          onClick={() => {
            setUserMenuOpen(false);
            setSwitcherOpen(open ? false : variant);
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Switch project. Current: ${activeProjectName}`}
          title={collapsed ? activeProjectName : undefined}
          className={clsx(
            "flex w-full items-center rounded-lg border border-border-soft bg-ink/[0.03] text-left transition-colors duration-fast hover:bg-ink/[0.06]",
            focusRing,
            collapsed && !isMobile ? "mx-auto h-9 w-9 justify-center p-0" : "gap-2.5 p-1.5 pr-2",
            isMobile && "min-h-[44px]",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-high font-mono text-xs text-ink">
            {initial}
          </span>
          {(!collapsed || isMobile) && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs text-faint">Project</span>
                <span className="block truncate text-caption font-medium text-ink">{activeProjectName}</span>
              </span>
              <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-faint" />
            </>
          )}
        </button>

        {open && (
          <div
            id="sidebar-project-switcher-dropdown"
            role="menu"
            aria-label="Project switcher"
            className={clsx(
              "absolute z-[60] mt-1.5 w-64 rounded-xl border border-border bg-panel p-1.5 shadow-apple-float",
              collapsed && !isMobile ? "left-full top-0 ml-3 mt-0" : "left-0 top-full",
            )}
          >
            <div className="relative mb-1.5">
              <Search size={13} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="text"
                value={switcherFilter}
                onChange={(e) => setSwitcherFilter(e.target.value)}
                placeholder="Filter projects…"
                aria-label="Filter projects"
                autoFocus
                className="h-8 w-full rounded-md border border-border-soft bg-base pl-8 pr-2.5 text-caption text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {filteredProjects.map((p) => {
                const current = p.id === activeProjectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    onClick={() => switchProject(p.id)}
                    className={clsx(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-fast hover:bg-ink/[0.06]",
                      focusRing,
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-high font-mono text-2xs text-muted">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption text-ink">{p.name}</span>
                      <span className="block truncate text-2xs text-faint">{p.description}</span>
                    </span>
                    {current && <Check size={14} aria-hidden="true" className="shrink-0 text-accent" />}
                  </button>
                );
              })}
              {filteredProjects.length === 0 && (
                <p className="px-2 py-3 text-center text-caption text-muted">
                  {switcherProjects.length === 0 ? "No projects yet" : `No projects match “${switcherFilter}”`}
                </p>
              )}
            </div>
            <div className="mt-1.5 flex gap-1 border-t border-border-soft pt-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSwitcherOpen(false);
                  navigate("/launch");
                }}
                className={clsx(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-pill bg-ink text-xs font-medium text-[rgb(var(--bg))] transition-colors hover:bg-ink/90",
                  focusRing,
                )}
              >
                <Plus size={13} aria-hidden="true" />
                New project
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSwitcherOpen(false);
                  navigate("/projects");
                }}
                className={clsx(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-pill border border-glass-border bg-glass text-xs font-medium text-ink transition-colors hover:bg-ink/10",
                  focusRing,
                )}
              >
                All projects
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUserCard = (collapsed: boolean, isMobile: boolean) => {
    const variant = isMobile ? "mobile" : "desktop";
    const open = userMenuOpen === variant;
    const menuItem = (label: string, Icon: LucideIcon, onSelect: () => void, danger = false) => (
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setUserMenuOpen(false);
          onSelect();
        }}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption transition-colors duration-fast",
          focusRing,
          danger ? "text-error hover:bg-error/10" : "text-ink hover:bg-ink/[0.06]",
        )}
      >
        <Icon size={14} aria-hidden="true" className={danger ? "" : "text-faint"} />
        {label}
      </button>
    );
    return (
      <div className="relative">
        <button
          type="button"
          id={isMobile ? "sidebar-user-menu-btn-mobile" : "sidebar-user-menu-btn"}
          onClick={() => {
            setSwitcherOpen(false);
            setUserMenuOpen(open ? false : variant);
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Account menu for ${displayName}`}
          title={collapsed ? displayName : undefined}
          className={clsx(
            "flex w-full items-center rounded-lg text-left transition-colors duration-fast hover:bg-ink/[0.04]",
            focusRing,
            collapsed && !isMobile ? "mx-auto h-10 w-10 justify-center" : "gap-2.5 p-1.5",
            isMobile && "min-h-[44px]",
          )}
        >
          <Avatar name={displayName} src={user?.avatar_url} size="sm" alt="" aria-hidden="true" />
          {(!collapsed || isMobile) && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-medium text-ink">{displayName}</span>
                <span className="block truncate text-2xs text-faint">
                  {planLabel} · {roleLabel}
                </span>
              </span>
              <ChevronUp size={14} aria-hidden="true" className={clsx("shrink-0 text-faint transition-transform", !open && "rotate-180")} />
            </>
          )}
        </button>
        {open && (
          <div
            role="menu"
            aria-label="Account menu"
            className={clsx(
              "absolute bottom-full z-[60] mb-2 w-60 rounded-xl border border-border bg-panel p-1.5 shadow-apple-float",
              collapsed && !isMobile ? "left-full bottom-0 mb-0 ml-3" : "left-0",
            )}
          >
            <div className="mb-1 border-b border-border-soft px-2.5 pb-2 pt-1">
              <p className="truncate text-caption font-medium text-ink">{displayName}</p>
              <p className="truncate text-2xs text-faint">{user?.email ?? (LIVE_MODE ? "" : CURRENT_USER.email)}</p>
            </div>
            {menuItem("Account settings", Settings, () => navigate("/settings"))}
            {menuItem("Billing & subscription", CreditCard, () => navigate("/billing"))}
            {activeProjectId &&
              menuItem("Engineering organization", Users, () => navigate(`/project/${activeProjectId}/org`))}
            {isAdmin && menuItem("Admin governance", Shield, () => navigate("/admin-console"))}
            {menuItem("Forge home", Home, () => navigate("/home"))}
            <div className="mt-1 border-t border-border-soft pt-1">
              {menuItem(
                "Sign out",
                LogOut,
                () => {
                  if (LIVE_MODE) logout().catch(() => {});
                  navigate("/login");
                },
                true,
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBody = (collapsed: boolean, isMobile: boolean) => (
    <>
      <div className={clsx("shrink-0 space-y-2.5", collapsed && !isMobile ? "px-2" : "px-3")}>
        {renderSwitcher(collapsed, isMobile)}
        <button
          type="button"
          id={isMobile ? "sidebar-search-trigger-mobile" : "sidebar-search-trigger"}
          onClick={() => {
            if (isMobile && onCloseMobile) onCloseMobile();
            openCommandPalette();
          }}
          aria-label="Search and commands (⌘K)"
          title={collapsed ? "Search (⌘K)" : undefined}
          className={clsx(
            "flex items-center rounded-pill border border-border-soft bg-ink/[0.03] text-caption text-faint transition-colors duration-fast hover:border-border hover:text-muted",
            focusRing,
            collapsed && !isMobile ? "mx-auto h-9 w-9 justify-center" : "h-9 w-full gap-2 px-3",
            isMobile && "min-h-[44px]",
          )}
        >
          <Search size={14} aria-hidden="true" className="shrink-0" />
          {(!collapsed || isMobile) && (
            <>
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded-xs border border-border-soft px-1.5 py-px font-mono text-2xs text-faint">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <div className={clsx("mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pb-3", collapsed && !isMobile ? "px-2" : "px-3")}>
        {groups.map((group) => (
          <nav
            key={group.id}
            aria-label={`${group.id === "project" ? "Project" : group.label}${isMobile ? " (mobile)" : ""}`}
            className="space-y-0.5"
          >
            {collapsed && !isMobile ? (
              <div aria-hidden="true" className="mx-2 mb-1.5 border-t border-border-soft first:hidden" />
            ) : (
              <div className="truncate px-2.5 pb-1 text-xs font-normal text-faint">{group.label}</div>
            )}
            {group.items.map((item) => renderNavItem(item, collapsed, isMobile))}
          </nav>
        ))}
      </div>

      <div className={clsx("shrink-0 space-y-1 border-t border-border-soft py-3", collapsed && !isMobile ? "px-2" : "px-3")}>
        <button
          type="button"
          id={isMobile ? "sidebar-help-btn-mobile" : "sidebar-help-btn"}
          onClick={() => setHelpOpen(true)}
          aria-label={collapsed && !isMobile ? "Help and keyboard shortcuts" : undefined}
          title={collapsed && !isMobile ? "Help" : undefined}
          className={clsx(
            "group flex items-center rounded-md text-caption font-medium text-muted transition-colors duration-fast hover:bg-ink/[0.04] hover:text-ink",
            focusRing,
            isMobile ? "min-h-[44px] w-full gap-3 px-3" : collapsed ? "mx-auto h-9 w-9 justify-center" : "h-9 w-full gap-2.5 px-2.5",
          )}
        >
          <HelpCircle size={16} aria-hidden="true" className="shrink-0 text-faint group-hover:text-ink" />
          {(!collapsed || isMobile) && <span>Help & shortcuts</span>}
        </button>
        {renderUserCard(collapsed, isMobile)}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop & tablet sidebar */}
      <aside
        id="left-nav-rail"
        aria-label="Workspace Sidebar"
        className={clsx(
          "relative hidden shrink-0 select-none flex-col border-r border-border-soft bg-panel transition-[width] duration-med ease-in-out md:flex",
          sidebarCollapsed ? "w-[64px]" : "w-[240px]",
        )}
      >
        <div
          className={clsx(
            "flex h-14 shrink-0 items-center",
            sidebarCollapsed ? "flex-col justify-center gap-1 px-2 pt-2 h-auto pb-2" : "justify-between px-4",
          )}
        >
          <Link
            to="/command"
            aria-label="Forge AI, go to Command Center"
            className={clsx("flex items-center gap-2 rounded-md", focusRing)}
          >
            <BrandLogo size="sm" />
            {!sidebarCollapsed && <span className="text-body font-medium tracking-tight text-ink">Forge</span>}
          </Link>
          <button
            type="button"
            id="rail-collapse-toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors duration-fast hover:bg-ink/[0.06] hover:text-ink",
              focusRing,
            )}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        </div>
        {renderBody(sidebarCollapsed, false)}
      </aside>

      {/* Mobile (<768px) slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-base/70 backdrop-blur-sm" onClick={onCloseMobile} aria-hidden="true" />
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-border-soft bg-panel"
          >
            <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
              <div className="flex items-center gap-2">
                <BrandLogo size="sm" />
                <span className="text-body font-medium tracking-tight text-ink">Forge</span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
                className={clsx(
                  "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted transition-colors duration-fast hover:bg-ink/[0.06] hover:text-ink",
                  focusRing,
                )}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {renderBody(false, true)}
          </div>
        </div>
      )}

      <Dialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Help & keyboard shortcuts"
        description="Everything in Forge is reachable from the sidebar or the command palette."
        footer={
          <Button variant="secondary" size="sm" onClick={() => setHelpOpen(false)}>
            Close
          </Button>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-caption">
          {SHORTCUTS.map(([keys, label]) => (
            <React.Fragment key={keys}>
              <dt>
                <kbd className="rounded-xs border border-border px-1.5 py-0.5 font-mono text-2xs text-muted">{keys}</kbd>
              </dt>
              <dd className="text-ink">{label}</dd>
            </React.Fragment>
          ))}
        </dl>
      </Dialog>
    </>
  );
};

export default LeftNavRail;
