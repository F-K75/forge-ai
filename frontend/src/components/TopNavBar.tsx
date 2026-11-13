import React, { useState, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Terminal,
  FolderGit2,
  Bot,
  Layers,
  GitCompare,
  Boxes,
  FolderTree,
  Clock,
  Brain,
  CreditCard,
  Settings,
  Search,
  Rocket,
  Home,
  ChevronDown,
  Plus,
  Menu,
  X,
  ExternalLink,
  Shield,
  LogOut,
  Users,
  Sparkles,
  Command,
  GitBranch,
  Activity,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { CURRENT_USER, PROJECTS } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { useActiveProject } from "../hooks/useActiveProject";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";
import BrandLogo from "./BrandLogo";

export interface TopNavBarProps {
  onOpenAgentFleet?: () => void;
  activeAgentCount?: number;
  creditsBalance?: number;
}

interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  shortcut?: string;
  match: (pathname: string) => boolean;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onOpenAgentFleet,
  activeAgentCount,
  creditsBalance,
}) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Dropdown states
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  // Refs for outside click handling
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Live system clock ticker
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // User details
  const name = LIVE_MODE ? user?.name ?? "Developer" : CURRENT_USER.name;
  const email = LIVE_MODE ? user?.email ?? "developer@forge.ai" : CURRENT_USER.email;
  const initial = (name || "F").charAt(0).toUpperCase();

  // Project context resolution (shared with AppShell / CommandPalette)
  const {
    activeProjectId: resolvedProjectId,
    activeProject: liveActiveProject,
    projects: liveProjects,
    projectPath,
    isLoading: projectsLoading,
  } = useActiveProject();
  const activeProjectId = resolvedProjectId ?? "";

  const allProjects = LIVE_MODE
    ? liveProjects.map((p) => ({ ...p, branch: "main" }))
    : [
        {
          id: "demo-project",
          name: "Forge Core Engine",
          description: "Autonomous multi-agent engineering platform",
          live: true,
          qaScore: 99,
          branch: "main",
        },
        ...PROJECTS.map((p) => ({
          ...p,
          branch: "main",
        })),
      ];

  const activeProject =
    allProjects.find((p) => p.id === activeProjectId) ||
    (liveActiveProject ? { ...liveActiveProject, branch: "main" } : null) || {
      id: activeProjectId,
      name: LIVE_MODE
        ? !activeProjectId
          ? "No project selected"
          : projectsLoading
          ? "Loading project…"
          : "Unknown project"
        : activeProjectId,
      description: "",
      live: false,
      qaScore: 0,
      branch: "main",
    };

  const filteredProjects = projectSearch.trim()
    ? allProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
          p.id.toLowerCase().includes(projectSearch.toLowerCase()) ||
          p.description.toLowerCase().includes(projectSearch.toLowerCase())
      )
    : allProjects;

  // Primary workflow navigation items
  const primaryNavItems: NavItem[] = [
    {
      to: projectPath("workspace"),
      label: "Workspace",
      description: "Interactive IDE, terminal & preview",
      icon: Terminal,
      shortcut: "⌥2",
      match: (p) =>
        p.startsWith("/build/") ||
        (p.startsWith("/p/") && p.includes("/workspace")) ||
        p === "/workspace",
    },
    {
      to: "/projects",
      label: "Projects",
      description: "Repository catalog & workspaces",
      icon: FolderGit2,
      shortcut: "⌥1",
      match: (p) => p === "/projects" || p.startsWith("/project/"),
    },
    {
      to: projectPath("initiatives"),
      label: "Initiatives",
      description: "Agile Kanban, sprints & roadmap",
      icon: Layers,
      shortcut: "⌥4",
      match: (p) => p.includes("/initiatives"),
    },
    {
      to: projectPath("flow"),
      label: "Agents",
      description: "Autonomous agent graph & fleet",
      icon: Bot,
      shortcut: "⌥3",
      match: (p) =>
        p === "/flow" ||
        p === "/agents" ||
        (p.startsWith("/p/") && (p.endsWith("/flow") || p.endsWith("/agents"))),
    },
    {
      to: projectPath("reviews"),
      label: "Reviews",
      description: "Agent PR reviews & diff inspector",
      icon: GitCompare,
      shortcut: "⌥5",
      match: (p) => p.includes("/reviews"),
    },
    {
      to: "/launch",
      label: "Launchpad",
      description: "Autonomous CLI generator",
      icon: Rocket,
      shortcut: "⌥L",
      match: (p) => p === "/launch",
    },
  ];

  // Secondary tools (in "More" dropdown)
  const secondaryNavItems: NavItem[] = [
    {
      to: "/marketplace",
      label: "Marketplace",
      description: "Agent capabilities & tool plugins",
      icon: Boxes,
      shortcut: "⌥6",
      match: (p) => p.startsWith("/marketplace"),
    },
    {
      to: projectPath("files"),
      label: "Files",
      description: "Repository file tree & assets",
      icon: FolderTree,
      shortcut: "⌥7",
      match: (p) => p.includes("/files"),
    },
    {
      to: projectPath("history"),
      label: "History",
      description: "Audit log & task revisions",
      icon: Clock,
      shortcut: "⌥8",
      match: (p) => p.includes("/history"),
    },
    {
      to: "/models",
      label: "Model Studio",
      description: "LLM providers, quotas & tuning",
      icon: Brain,
      shortcut: "⌥9",
      match: (p) => p === "/models" || p.startsWith("/llm-management"),
    },
    {
      to: "/billing",
      label: "Billing & Compute",
      description: "Usage credits & subscriptions",
      icon: CreditCard,
      shortcut: "⌥0",
      match: (p) => p.startsWith("/billing"),
    },
    {
      to: "/admin-console",
      label: "Admin Console",
      description: "System governance & policies",
      icon: Shield,
      match: (p) => p.startsWith("/admin-console"),
    },
    {
      to: projectPath("settings"),
      label: "Settings",
      description: "Workspace & integration preferences",
      icon: Settings,
      shortcut: "⌥,",
      match: (p) => p.includes("/settings"),
    },
  ];

  // Model Studio and Admin Console are backed by admin-only APIs; showing
  // them to everyone just led to pages full of 403s.
  const ADMIN_ONLY = new Set(["/models", "/admin-console"]);
  const isAdmin = !LIVE_MODE || user?.is_admin === true;
  const visibleSecondaryNavItems = secondaryNavItems.filter(
    (item) => isAdmin || !ADMIN_ONLY.has(item.to)
  );

  // Close menus on route change or outside click
  useEffect(() => {
    setShowProjectMenu(false);
    setShowMoreMenu(false);
    setShowUserMenu(false);
    setShowMobileDrawer(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setShowProjectMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowProjectMenu(false);
        setShowMoreMenu(false);
        setShowUserMenu(false);
        setShowMobileDrawer(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSwitchProject = (projectId: string) => {
    setShowProjectMenu(false);
    setShowMobileDrawer(false);
    try {
      localStorage.setItem("forge_last_project", projectId);
    } catch {
      // ignore storage error
    }
    if (location.pathname.startsWith("/p/")) {
      const parts = location.pathname.split("/");
      const subPath = parts.slice(3).join("/");
      navigate(`/p/${projectId}/${subPath || "workspace"}`);
    } else {
      navigate(`/p/${projectId}/workspace`);
    }
  };

  const triggerCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  };

  const isMoreActive = visibleSecondaryNavItems.some((item) => item.match(location.pathname));

  return (
    <>
      {/* =========================================================================
          REDESIGNED MODERN TOP NAVIGATION BAR
          Sleek, high-precision developer OS header with zero-pill discipline,
          responsive drawer, and unified workspace context.
      ========================================================================= */}
      <header
        id="os-menubar"
        role="banner"
        className="h-14 shrink-0 bg-white/95 dark:bg-[#0E0F14]/95 backdrop-blur-md border-b border-black/10 dark:border-white/10 px-3 sm:px-4 flex items-center justify-between z-40 select-none transition-colors"
      >
        {/* =====================================================================
            ZONE 1: LEFT - BRAND & WORKSPACE CONTEXT
        ===================================================================== */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowMobileDrawer((v) => !v)}
            aria-label="Toggle Navigation Drawer"
            className="lg:hidden p-1.5 rounded-lg border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-transform"
          >
            {showMobileDrawer ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Forge AI Brand Anchor */}
          <NavLink
            to="/home"
            id="os-logo-btn"
            className="flex items-center gap-2 py-1 px-1.5 -ml-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors group shrink-0"
            title="Forge AI OS - Return to Home"
          >
            <BrandLogo size="xs" />
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono font-black text-xs sm:text-sm tracking-wider uppercase text-neutral-900 dark:text-white">
                FORGE
              </span>
              <span className="hidden sm:inline-block font-mono text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
                OS 2.4
              </span>
            </div>
          </NavLink>

          {/* Refined Vertical Divider */}
          <div className="hidden sm:block h-4 w-px bg-black/10 dark:bg-white/10 shrink-0" />

          {/* Interactive Workspace Context Switcher */}
          <div className="relative shrink-0" ref={projectMenuRef}>
            <button
              type="button"
              id="taskbar-project-switcher-btn"
              onClick={() => setShowProjectMenu((v) => !v)}
              aria-expanded={showProjectMenu}
              aria-haspopup="true"
              className={`h-8 px-2.5 rounded-lg border text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer ${
                showProjectMenu
                  ? "bg-black/5 dark:bg-white/10 border-black/20 dark:border-white/20 text-neutral-900 dark:text-white shadow-xs"
                  : "bg-neutral-50/75 dark:bg-white/[0.04] border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/[0.08]"
              }`}
              title={`Active Project: ${activeProject.name}`}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 shrink-0 animate-pulse" />
              <FolderGit2 size={13} className="text-amber-500 shrink-0" />
              <span className="max-w-[100px] sm:max-w-[140px] md:max-w-[180px] truncate font-semibold">
                {activeProject.name}
              </span>
              <ChevronDown
                size={12}
                className={`text-neutral-400 transition-transform duration-200 ${
                  showProjectMenu ? "rotate-180 text-neutral-900 dark:text-white" : ""
                }`}
              />
            </button>

            {/* Project Switcher Dropdown Popover */}
            {showProjectMenu && (
              <div
                id="taskbar-project-switcher-dropdown"
                role="menu"
                aria-label="Workspace Switcher"
                className="absolute top-10 left-0 z-50 w-72 sm:w-80 rounded-xl bg-white dark:bg-[#14151B] border border-black/10 dark:border-white/15 shadow-xl p-2 font-mono text-xs space-y-2 text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-150"
              >
                {/* Header & Count */}
                <div className="flex items-center justify-between px-2 pt-1 pb-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    Workspaces & Repositories
                  </span>
                  <span>{allProjects.length} active</span>
                </div>

                {/* Filter Search Input */}
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Filter workspaces..."
                    className="w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.04] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-accent"
                    autoFocus
                  />
                </div>

                {/* Project List */}
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {filteredProjects.map((p) => {
                    const isCurrent = p.id === activeProjectId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleSwitchProject(p.id)}
                        className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isCurrent
                            ? "bg-accent/10 border border-accent/30 text-accent font-semibold"
                            : "hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-200 border border-transparent"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <FolderGit2 size={13} className="shrink-0 text-amber-500" />
                            <span className="truncate font-semibold">{p.name}</span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-accent/20 text-accent font-mono uppercase font-bold">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                            {p.description}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                            {p.qaScore ? `QA ${p.qaScore}%` : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredProjects.length === 0 && (
                    <div className="p-3 text-center text-neutral-500 text-xs">
                      No workspaces matching "{projectSearch}"
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="pt-2 border-t border-black/10 dark:border-white/10 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectMenu(false);
                      navigate("/launch");
                    }}
                    className="flex-1 h-7 px-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                    <span>New Project</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectMenu(false);
                      navigate("/projects");
                    }}
                    className="flex-1 h-7 px-2 rounded-lg border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FolderGit2 size={12} />
                    <span>All Repos</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =====================================================================
            ZONE 2: CENTER - WORKFLOW NAVIGATION TABS
        ===================================================================== */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-1 h-9 px-1 rounded-xl bg-neutral-100/80 dark:bg-white/[0.04] border border-black/5 dark:border-white/5"
        >
          {primaryNavItems.map((item) => {
            const isActive = item.match(location.pathname);
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                id={`taskbar-tab-${item.label.toLowerCase()}`}
                className={`relative h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  isActive
                    ? "bg-white dark:bg-[#1A1B22] text-neutral-900 dark:text-white font-semibold shadow-xs"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/[0.03]"
                }`}
                title={`${item.label} (${item.shortcut}) - ${item.description}`}
              >
                <ItemIcon
                  size={13}
                  className={isActive ? "text-accent" : "text-neutral-400 dark:text-neutral-500"}
                />
                <span>{item.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1 left-2.5 right-2.5 h-0.5 bg-accent rounded-full"
                  />
                )}
              </NavLink>
            );
          })}

          {/* Secondary Tools "More" Menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu((v) => !v)}
              aria-expanded={showMoreMenu}
              aria-haspopup="true"
              className={`h-7 px-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                isMoreActive || showMoreMenu
                  ? "bg-white dark:bg-[#1A1B22] text-neutral-900 dark:text-white font-semibold shadow-xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
              title="More workspace tools"
            >
              <span>More</span>
              <ChevronDown
                size={11}
                className={`text-neutral-400 transition-transform duration-200 ${
                  showMoreMenu ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* More Menu Dropdown */}
            {showMoreMenu && (
              <div
                role="menu"
                aria-label="Secondary tools"
                className="absolute top-9 right-0 z-50 w-64 rounded-xl bg-white dark:bg-[#14151B] border border-black/10 dark:border-white/15 shadow-xl p-1.5 space-y-0.5 text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Ecosystem & Utilities
                </div>
                {visibleSecondaryNavItems.map((item) => {
                  const isActive = item.match(location.pathname);
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.label}
                      to={item.to}
                      role="menuitem"
                      onClick={() => setShowMoreMenu(false)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isActive
                          ? "bg-accent/10 text-accent font-semibold"
                          : "hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={14} className={isActive ? "text-accent" : "text-neutral-400"} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.shortcut && (
                        <kbd className="text-[10px] font-mono px-1 rounded bg-black/5 dark:bg-white/10 text-neutral-400">
                          {item.shortcut}
                        </kbd>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* =====================================================================
            ZONE 3: RIGHT - TELEMETRY & SYSTEM CONTROLS
        ===================================================================== */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Global Search / Command Bar Trigger */}
          <button
            type="button"
            id="os-terminal-trigger"
            onClick={triggerCommandPalette}
            className="flex items-center gap-2 h-8 px-2 sm:px-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50/75 dark:bg-white/[0.04] hover:bg-neutral-100 dark:hover:bg-white/[0.08] text-neutral-500 dark:text-neutral-400 text-xs transition-all cursor-pointer"
            title="Search commands, files, or agents (⌘K)"
          >
            <Search size={13} className="shrink-0" />
            <span className="hidden md:inline font-sans text-neutral-600 dark:text-neutral-300">
              Search
            </span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[10px] font-mono text-neutral-500 dark:text-neutral-400 border border-black/5 dark:border-white/5">
              ⌘K
            </kbd>
          </button>

          {/* Autonomous Fleet Monitor Beacon */}
          {activeAgentCount !== undefined && (
          <button
            type="button"
            id="os-agent-fleet-trigger"
            onClick={() => onOpenAgentFleet && onOpenAgentFleet()}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50/75 dark:bg-white/[0.04] hover:border-accent/40 text-xs font-mono text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer group"
            title="Inspect Agent Fleet Topology"
          >
            <div className="relative flex items-center justify-center">
              <Bot size={13} className="text-neutral-500 group-hover:text-accent transition-colors" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 animate-ping" />
            </div>
            <span className="hidden xl:inline text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
              Fleet:
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {activeAgentCount}
            </span>
          </button>
          )}

          {/* Compute Credits Balance */}
          <NavLink
            to="/billing"
            id="os-credits-chip"
            className="hidden xl:flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50/75 dark:bg-white/[0.04] hover:bg-neutral-100 dark:hover:bg-white/[0.08] text-xs font-mono text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer"
            title="Compute credit quota & billing"
          >
            <Sparkles size={12} className="text-amber-500 shrink-0" />
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {creditsBalance === undefined ? "—" : creditsBalance.toLocaleString()}
            </span>
            <span className="text-[10px] text-neutral-400">CR</span>
          </NavLink>

          {/* Notifications Center */}
          <div className="shrink-0">
            <NotificationsBell />
          </div>

          {/* Theme Mode Switcher */}
          <div className="shrink-0">
            <ThemeToggle compact />
          </div>

          {/* System Clock */}
          <div
            id="os-live-clock"
            className="hidden 2xl:flex items-center h-8 px-2 rounded-lg border border-black/5 dark:border-white/5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400"
            title="Live System Time"
          >
            {time}
          </div>

          {/* User Account Popover */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              id="os-user-profile-badge"
              onClick={() => setShowUserMenu((v) => !v)}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
              className="w-8 h-8 rounded-full bg-linear-to-tr from-accent to-emerald-400 text-neutral-950 font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-black/5 dark:ring-white/10 hover:ring-accent transition-all cursor-pointer"
              title={`Logged in as ${name}`}
            >
              {initial}
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div
                role="menu"
                aria-label="User Account Menu"
                className="absolute top-10 right-0 z-50 w-64 rounded-xl bg-white dark:bg-[#14151B] border border-black/10 dark:border-white/15 shadow-xl p-2 font-mono text-xs space-y-2 text-neutral-900 dark:text-neutral-100 animate-in fade-in zoom-in-95 duration-150"
              >
                {/* User Identity Header */}
                <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-white/[0.04] border border-black/5 dark:border-white/5">
                  <div className="font-sans font-bold text-xs truncate text-neutral-900 dark:text-white">
                    {name}
                  </div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    {email}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[9px]">
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      Staff Engineer
                    </span>
                    <span className="text-neutral-400">·</span>
                    <span className="text-neutral-500">Tier: Enterprise</span>
                  </div>
                </div>

                {/* Account Navigation Links */}
                <div className="space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(projectPath("settings"));
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
                  >
                    <Settings size={13} className="text-neutral-400" />
                    <span>Account Settings</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/billing");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
                  >
                    <CreditCard size={13} className="text-neutral-400" />
                    <span>Billing & Subscriptions</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(activeProjectId ? `/project/${activeProjectId}/org` : "/projects");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
                  >
                    <Users size={13} className="text-neutral-400" />
                    <span>Engineering Organization</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/admin-console");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
                  >
                    <Shield size={13} className="text-neutral-400" />
                    <span>Admin Governance</span>
                  </button>
                </div>

                {/* Footer: Sign Out & Live Engine Status */}
                <div className="pt-2 border-t border-black/10 dark:border-white/10 space-y-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      if (LIVE_MODE) {
                        logout().catch(() => {});
                      }
                      navigate("/login");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs transition-colors cursor-pointer"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                  <div className="px-2 pt-1 flex items-center justify-between text-[9px] text-neutral-400">
                    <span>Engine v2.4.0</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      14ms latency
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          MOBILE / TABLET SLIDE-OVER NAVIGATION DRAWER
      ========================================================================= */}
      {showMobileDrawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowMobileDrawer(false)}
          />

          {/* Drawer Canvas */}
          <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white dark:bg-[#121319] border-r border-black/10 dark:border-white/10 shadow-2xl flex flex-col font-sans z-50">
            {/* Drawer Header */}
            <div className="h-14 px-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrandLogo size="xs" />
                <span className="font-mono font-bold text-sm tracking-wider uppercase">
                  FORGE AI OS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileDrawer(false)}
                className="p-1 rounded-lg text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Active Workspace Card */}
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.04] border border-black/10 dark:border-white/10 font-mono">
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">
                  Active Workspace
                </div>
                <div className="flex items-center gap-2 font-bold text-xs truncate">
                  <FolderGit2 size={14} className="text-amber-500 shrink-0" />
                  <span className="truncate">{activeProject.name}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-neutral-500">
                  <span className="flex items-center gap-1">
                    <GitBranch size={10} />
                    main
                  </span>
                  <span>·</span>
                  <span>QA {activeProject.qaScore ? `${activeProject.qaScore}%` : "—"}</span>
                </div>
              </div>

              {/* Primary Workflow Navigation */}
              <div>
                <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                  Core Workflow
                </div>
                <div className="space-y-0.5">
                  {primaryNavItems.map((item) => {
                    const isActive = item.match(location.pathname);
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={() => setShowMobileDrawer(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                          isActive
                            ? "bg-accent/10 text-accent font-semibold"
                            : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={16} className={isActive ? "text-accent" : "text-neutral-400"} />
                          <span>{item.label}</span>
                        </div>
                        {item.shortcut && (
                          <span className="text-[10px] font-mono text-neutral-400">
                            {item.shortcut}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>

              {/* Ecosystem & Secondary Tools */}
              <div>
                <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                  Ecosystem & Settings
                </div>
                <div className="space-y-0.5">
                  {visibleSecondaryNavItems.map((item) => {
                    const isActive = item.match(location.pathname);
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={() => setShowMobileDrawer(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                          isActive
                            ? "bg-accent/10 text-accent font-semibold"
                            : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={16} className={isActive ? "text-accent" : "text-neutral-400"} />
                          <span>{item.label}</span>
                        </div>
                        {item.shortcut && (
                          <span className="text-[10px] font-mono text-neutral-400">
                            {item.shortcut}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-xs">
                  {initial}
                </div>
                <div className="text-xs">
                  <div className="font-semibold truncate max-w-[120px]">{name}</div>
                  <div className="text-[10px] text-neutral-400">{creditsBalance ?? "—"} CR</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMobileDrawer(false);
                  navigate("/settings");
                }}
                className="p-2 rounded-lg text-neutral-500 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopNavBar;
