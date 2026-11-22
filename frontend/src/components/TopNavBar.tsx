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
  ChevronDown,
  Plus,
  Menu,
  X,
  Shield,
  LogOut,
  Users,
  Sparkles,
  GitBranch,
  Box,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { CURRENT_USER, PROJECTS } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
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
  activeAgentCount = 3,
  creditsBalance = 1247,
}) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const projectMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const name = user?.name ?? (LIVE_MODE ? "Developer" : CURRENT_USER.name);
  const email = user?.email ?? (LIVE_MODE ? "developer@forge.ai" : CURRENT_USER.email);
  const isAdmin = user?.is_admin ?? true;
  const initial = (name || "F").charAt(0).toUpperCase();

  const projectMatch = location.pathname.match(/^\/(?:p|build|project)\/([^/]+)/);
  const activeProjectId = projectMatch
    ? projectMatch[1]
    : localStorage.getItem("forge_last_project") || "demo-project";

  const allProjects = [
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
    allProjects.find((p) => p.id === activeProjectId) || {
      id: activeProjectId,
      name: activeProjectId,
      description: "Active workspace",
      live: true,
      qaScore: 95,
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

  const primaryNavItems: NavItem[] = [
    {
      to: `/p/${activeProjectId}/workspace`,
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
      to: `/p/${activeProjectId}/initiatives`,
      label: "Initiatives",
      description: "Agile Kanban, sprints & roadmap",
      icon: Layers,
      shortcut: "⌥4",
      match: (p) => p.includes("/initiatives"),
    },
    {
      to: `/p/${activeProjectId}/flow`,
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
      to: `/p/${activeProjectId}/reviews`,
      label: "Reviews",
      description: "Agent PR reviews & diff inspector",
      icon: GitCompare,
      shortcut: "⌥5",
      match: (p) => p.includes("/reviews"),
    },
    {
      to: "/studio-3d",
      label: "3D Studio",
      description: "Interactive Three.js agent architecture viewport",
      icon: Box,
      shortcut: "⌥D",
      match: (p) => p === "/studio-3d",
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
      to: `/p/${activeProjectId}/files`,
      label: "Files",
      description: "Repository file tree & assets",
      icon: FolderTree,
      shortcut: "⌥7",
      match: (p) => p.includes("/files"),
    },
    {
      to: `/p/${activeProjectId}/history`,
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
      to: `/p/${activeProjectId}/settings`,
      label: "Settings",
      description: "Workspace & integration preferences",
      icon: Settings,
      shortcut: "⌥,",
      match: (p) => p.includes("/settings"),
    },
  ];

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

  const isMoreActive = secondaryNavItems.some((item) => item.match(location.pathname));

  return (
    <>
      <header
        id="os-menubar"
        role="banner"
        className="z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-3 sm:px-4 select-none transition-colors"
      >
        {/* ZONE 1: Brand + Active Workspace Switcher */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setShowMobileDrawer((v) => !v)}
            aria-label="Toggle Navigation Drawer"
            className="lg:hidden rounded-md border border-border p-1.5 text-muted hover:bg-panel-alt hover:text-ink transition-colors"
          >
            {showMobileDrawer ? <X size={18} /> : <Menu size={18} />}
          </button>

          <NavLink
            to="/home"
            id="os-logo-btn"
            className="flex shrink-0 items-center gap-2 rounded-md py-1 px-1.5 -ml-1 transition-colors hover:bg-panel-alt whitespace-nowrap"
            title="Forge AI - Return to Home"
          >
            <BrandLogo size="xs" />
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              FORGE
            </span>
            <span className="hidden sm:inline font-mono text-[10px] text-muted">
              OS 2.4
            </span>
          </NavLink>

          <div className="hidden sm:block h-4 w-px bg-border shrink-0" />

          {/* Workspace Switcher */}
          <div className="relative shrink-0" ref={projectMenuRef}>
            <button
              type="button"
              id="taskbar-project-switcher-btn"
              onClick={() => setShowProjectMenu((v) => !v)}
              aria-expanded={showProjectMenu}
              aria-haspopup="true"
              className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showProjectMenu
                  ? "border-faint bg-panel-alt text-ink"
                  : "border-border bg-base/60 text-ink hover:bg-panel-alt"
              }`}
              title={`Active Project: ${activeProject.name}`}
            >
              <FolderGit2 size={13} className="shrink-0 text-accent" />
              <span className="max-w-[110px] sm:max-w-[150px] truncate">
                {activeProject.name}
              </span>
              <ChevronDown
                size={12}
                className={`text-muted transition-transform duration-fast ${
                  showProjectMenu ? "rotate-180 text-ink" : ""
                }`}
              />
            </button>

            {showProjectMenu && (
              <div
                id="taskbar-project-switcher-dropdown"
                role="menu"
                aria-label="Workspace Switcher"
                className="absolute left-0 top-10 z-50 w-72 sm:w-80 rounded-lg border border-border bg-panel p-2 shadow-apple-lg text-xs space-y-2"
              >
                <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-muted">
                  <span className="font-medium">Workspaces</span>
                  <span className="font-mono tabular-nums">{allProjects.length} active</span>
                </div>

                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Filter workspaces..."
                    className="h-8 w-full rounded-md border border-border bg-base pl-8 pr-2.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {filteredProjects.map((p) => {
                    const isCurrent = p.id === activeProjectId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleSwitchProject(p.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md p-2 text-left transition-colors cursor-pointer ${
                          isCurrent
                            ? "bg-accent/10 text-accent font-medium"
                            : "text-ink hover:bg-panel-alt"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <FolderGit2 size={13} className="shrink-0 text-accent" />
                            <span className="truncate font-medium">{p.name}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted">
                            {p.description}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                          {p.qaScore}%
                        </span>
                      </button>
                    );
                  })}
                  {filteredProjects.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted">
                      No workspaces matching &ldquo;{projectSearch}&rdquo;
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 border-t border-border pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectMenu(false);
                      navigate("/launch");
                    }}
                    className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 text-xs font-medium text-white hover:bg-ember-glow transition-colors cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>New Project</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProjectMenu(false);
                      navigate("/projects");
                    }}
                    className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-panel px-2 text-xs font-medium text-ink hover:bg-panel-alt transition-colors cursor-pointer"
                  >
                    <FolderGit2 size={12} />
                    <span>All Repos</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ZONE 2: Primary Workflow Tabs */}
        <nav aria-label="Primary Navigation" className="hidden lg:flex items-center gap-1">
          {primaryNavItems.map((item) => {
            const isActive = item.match(location.pathname);
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                id={`taskbar-tab-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-panel-alt text-ink font-semibold"
                    : "text-muted hover:bg-panel-alt/60 hover:text-ink"
                }`}
                title={`${item.label} (${item.shortcut}) - ${item.description}`}
              >
                <ItemIcon
                  size={13}
                  className={isActive ? "text-accent" : "text-muted"}
                />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu((v) => !v)}
              aria-expanded={showMoreMenu}
              aria-haspopup="true"
              className={`flex h-9 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                isMoreActive || showMoreMenu
                  ? "bg-panel-alt text-ink font-semibold"
                  : "text-muted hover:bg-panel-alt/60 hover:text-ink"
              }`}
              title="More workspace tools"
            >
              <span>More</span>
              <ChevronDown
                size={11}
                className={`text-muted transition-transform duration-fast ${
                  showMoreMenu ? "rotate-180" : ""
                }`}
              />
            </button>

            {showMoreMenu && (
              <div
                role="menu"
                aria-label="Secondary tools"
                className="absolute right-0 top-10 z-50 w-60 rounded-lg border border-border bg-panel p-1.5 shadow-apple-lg space-y-0.5 text-xs"
              >
                <div className="px-2.5 py-1 text-[11px] font-medium text-muted">
                  Tools & Governance
                </div>
                {secondaryNavItems.map((item) => {
                  const isActive = item.match(location.pathname);
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      role="menuitem"
                      onClick={() => setShowMoreMenu(false)}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 transition-colors cursor-pointer ${
                        isActive
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-ink hover:bg-panel-alt"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon size={14} className={isActive ? "text-accent" : "text-muted"} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.shortcut && (
                        <kbd className="font-mono text-[10px] text-muted">{item.shortcut}</kbd>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* ZONE 3: Search, Fleet, Credits, Theme, User */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            id="os-terminal-trigger"
            onClick={triggerCommandPalette}
            className="flex h-8 items-center gap-2 rounded-md border border-border bg-base/60 px-2.5 text-xs text-muted transition-colors hover:bg-panel-alt hover:text-ink cursor-pointer whitespace-nowrap"
            title="Search commands, files, or agents (⌘K)"
          >
            <Search size={13} className="shrink-0" />
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden sm:inline font-mono text-[10px] text-faint">⌘K</kbd>
          </button>

          <button
            type="button"
            id="os-agent-fleet-trigger"
            onClick={() => onOpenAgentFleet && onOpenAgentFleet()}
            className="hidden sm:flex h-8 items-center gap-1.5 rounded-md border border-border bg-base/60 px-2.5 text-xs font-medium text-ink transition-colors hover:bg-panel-alt cursor-pointer whitespace-nowrap tabular-nums"
            title="Inspect Agent Fleet Topology"
          >
            <Bot size={13} className="text-accent" />
            <span className="hidden xl:inline text-muted">Fleet</span>
            <span className="font-mono font-semibold text-ok">{activeAgentCount}</span>
          </button>

          <NavLink
            to="/billing"
            id="os-credits-chip"
            className="hidden xl:flex h-8 items-center gap-1.5 rounded-md border border-border bg-base/60 px-2.5 font-mono text-xs text-ink transition-colors hover:bg-panel-alt cursor-pointer whitespace-nowrap tabular-nums"
            title="Compute credit quota & billing"
          >
            <Sparkles size={12} className="text-accent shrink-0" />
            <span className="font-medium">{creditsBalance.toLocaleString()}</span>
            <span className="text-[10px] text-muted">CR</span>
          </NavLink>

          <div className="shrink-0">
            <NotificationsBell />
          </div>

          <div className="shrink-0">
            <ThemeToggle compact />
          </div>

          {/* User Account Popover */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              id="os-user-profile-badge"
              onClick={() => setShowUserMenu((v) => !v)}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white transition-colors hover:bg-ember-glow cursor-pointer"
              title={`Logged in as ${name}`}
            >
              {initial}
            </button>

            {showUserMenu && (
              <div
                role="menu"
                aria-label="User Account Menu"
                className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-border bg-panel p-2 shadow-apple-lg text-xs space-y-2"
              >
                <div className="rounded-md border border-border bg-panel-alt/60 p-2.5">
                  <div className="truncate font-semibold text-ink">{name}</div>
                  <div className="truncate text-[11px] text-muted">{email}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                    {isAdmin && (
                      <>
                        <span className="font-semibold text-accent">Admin</span>
                        <span>·</span>
                      </>
                    )}
                    <span>Enterprise</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(`/p/${activeProjectId}/settings`);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-ink hover:bg-panel-alt transition-colors cursor-pointer"
                  >
                    <Settings size={13} className="text-muted" />
                    <span>Account Settings</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/billing");
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-ink hover:bg-panel-alt transition-colors cursor-pointer"
                  >
                    <CreditCard size={13} className="text-muted" />
                    <span>Billing & Subscriptions</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(`/project/${activeProjectId}/org`);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-ink hover:bg-panel-alt transition-colors cursor-pointer"
                  >
                    <Users size={13} className="text-muted" />
                    <span>Engineering Organization</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/admin-console");
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-ink hover:bg-panel-alt transition-colors cursor-pointer"
                  >
                    <Shield size={13} className="text-muted" />
                    <span>Admin Governance</span>
                  </button>
                </div>

                <div className="border-t border-border pt-2">
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
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-error hover:bg-error/10 transition-colors cursor-pointer"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {showMobileDrawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/55"
            onClick={() => setShowMobileDrawer(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-76 max-w-[85vw] flex-col border-r border-border bg-panel shadow-apple-float">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <BrandLogo size="xs" />
                <span className="font-display text-sm font-semibold text-ink">Forge AI</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileDrawer(false)}
                className="rounded-md p-1.5 text-muted hover:bg-panel-alt hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              <div className="rounded-lg border border-border bg-panel-alt/60 p-3">
                <div className="text-[11px] font-medium text-muted">Active Workspace</div>
                <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-ink truncate">
                  <FolderGit2 size={14} className="text-accent shrink-0" />
                  <span className="truncate">{activeProject.name}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <GitBranch size={11} /> main
                  </span>
                  <span>·</span>
                  <span>QA {activeProject.qaScore}%</span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 px-2 text-[11px] font-medium text-muted">Core Workflow</div>
                <div className="space-y-0.5">
                  {primaryNavItems.map((item) => {
                    const isActive = item.match(location.pathname);
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setShowMobileDrawer(false)}
                        className={`flex items-center justify-between rounded-md px-3 py-2 text-xs transition-colors ${
                          isActive
                            ? "bg-accent/10 text-accent font-medium"
                            : "text-ink hover:bg-panel-alt"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={15} className={isActive ? "text-accent" : "text-muted"} />
                          <span>{item.label}</span>
                        </div>
                        {item.shortcut && (
                          <span className="font-mono text-[10px] text-muted">{item.shortcut}</span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 px-2 text-[11px] font-medium text-muted">
                  Ecosystem &amp; Settings
                </div>
                <div className="space-y-0.5">
                  {secondaryNavItems.map((item) => {
                    const isActive = item.match(location.pathname);
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setShowMobileDrawer(false)}
                        className={`flex items-center justify-between rounded-md px-3 py-2 text-xs transition-colors ${
                          isActive
                            ? "bg-accent/10 text-accent font-medium"
                            : "text-ink hover:bg-panel-alt"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={15} className={isActive ? "text-accent" : "text-muted"} />
                          <span>{item.label}</span>
                        </div>
                        {item.shortcut && (
                          <span className="font-mono text-[10px] text-muted">{item.shortcut}</span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-panel-alt/50 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {initial}
                </div>
                <div className="text-xs">
                  <div className="max-w-[130px] truncate font-medium text-ink">{name}</div>
                  <div className="font-mono text-[10px] text-muted tabular-nums">
                    {creditsBalance} CR
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMobileDrawer(false);
                  navigate("/settings");
                }}
                className="rounded-md p-2 text-muted hover:bg-panel-alt hover:text-ink"
              >
                <Settings size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopNavBar;
