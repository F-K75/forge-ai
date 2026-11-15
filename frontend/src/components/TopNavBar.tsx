import React, { useState, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FolderGit2,
  Bot,
  Search,
  ChevronDown,
  Plus,
  Menu,
  X,
  Shield,
  LogOut,
  CreditCard,
  Settings,
  Sparkles,
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
  onToggleMobileNav?: () => void;
  mobileNavOpen?: boolean;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onOpenAgentFleet,
  activeAgentCount,
  creditsBalance,
  onToggleMobileNav,
  mobileNavOpen = false,
}) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const projectMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const name = LIVE_MODE ? user?.name ?? "Developer" : CURRENT_USER.name;
  const email = LIVE_MODE ? user?.email ?? "developer@forge.ai" : CURRENT_USER.email;
  const initial = (name || "F").charAt(0).toUpperCase();
  const isAdmin = !LIVE_MODE || user?.is_admin === true;

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

  useEffect(() => {
    setShowProjectMenu(false);
    setShowUserMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setShowProjectMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowProjectMenu(false);
        setShowUserMenu(false);
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

  return (
    <header
      id="os-menubar"
      role="banner"
      className="h-14 shrink-0 bg-panel border-b border-border px-3 sm:px-4 flex items-center justify-between gap-2 z-40 select-none transition-colors duration-150 ease-in-out"
    >
      {/* Left Zone: Mobile Toggle + Brand Mark + Project Switcher Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label="Toggle Navigation Drawer"
          aria-expanded={mobileNavOpen}
          className="sm:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border text-muted hover:bg-panel-alt hover:text-ink transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <NavLink
          to="/home"
          id="os-logo-btn"
          className="flex items-center gap-2 py-1 px-1.5 -ml-1 rounded-lg hover:bg-panel-alt transition-colors duration-150 ease-in-out shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title="Forge AI - Return to Home"
        >
          <BrandLogo size="xs" />
          <span className="font-mono font-bold text-xs sm:text-sm tracking-wider uppercase text-ink">
            FORGE
          </span>
        </NavLink>

        <span aria-hidden="true" className="hidden sm:inline-block text-muted/60 font-mono text-xs">
          /
        </span>

        {/* Project Switcher Breadcrumb */}
        <div className="relative min-w-0" ref={projectMenuRef}>
          <button
            type="button"
            id="taskbar-project-switcher-btn"
            onClick={() => setShowProjectMenu((v) => !v)}
            aria-expanded={showProjectMenu}
            aria-haspopup="true"
            className={`h-8 px-2.5 rounded-lg border text-xs font-mono font-medium flex items-center gap-2 transition-colors duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              showProjectMenu
                ? "bg-panel-alt border-accent/40 text-ink"
                : "bg-panel-alt/60 border-border text-ink hover:bg-panel-alt"
            }`}
            title={`Active Project: ${activeProject.name}`}
          >
            <span className="w-2 h-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
            <FolderGit2 size={13} className="text-accent shrink-0" />
            <span className="max-w-[110px] sm:max-w-[180px] md:max-w-[220px] truncate font-semibold">
              {activeProject.name}
            </span>
            <ChevronDown
              size={12}
              className={`text-muted transition-transform duration-150 ease-in-out ${
                showProjectMenu ? "rotate-180 text-ink" : ""
              }`}
            />
          </button>

          {showProjectMenu && (
            <div
              id="taskbar-project-switcher-dropdown"
              role="menu"
              aria-label="Workspace Switcher"
              className="absolute top-10 left-0 z-50 w-72 sm:w-80 rounded-lg bg-panel border border-border shadow-m3-3 p-2 font-mono text-xs space-y-2 text-ink"
            >
              <div className="flex items-center justify-between px-2 pt-1 pb-0.5 text-[11px] text-muted">
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  Projects
                </span>
                <span>{allProjects.length} active</span>
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
                  aria-label="Filter workspaces"
                  className="w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border border-border bg-base text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  autoFocus
                />
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {filteredProjects.map((p) => {
                  const isCurrent = p.id === activeProjectId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleSwitchProject(p.id)}
                      className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 transition-colors duration-150 ease-in-out cursor-pointer ${
                        isCurrent
                          ? "bg-accent-soft border border-accent/30 text-accent font-semibold"
                          : "hover:bg-panel-alt text-ink border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <FolderGit2 size={13} className="shrink-0 text-accent" />
                          <span className="truncate font-semibold">{p.name}</span>
                          {isCurrent && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-soft text-accent font-mono uppercase font-bold">
                              Current
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <div className="text-[10px] text-muted truncate mt-0.5">
                            {p.description}
                          </div>
                        )}
                      </div>
                      {p.qaScore ? (
                        <span className="text-[10px] font-mono text-muted shrink-0">
                          QA {p.qaScore}%
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredProjects.length === 0 && (
                  <div className="p-3 text-center text-muted text-xs">
                    No workspaces matching "{projectSearch}"
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowProjectMenu(false);
                    navigate("/launch");
                  }}
                  className="flex-1 h-8 px-2 rounded-lg bg-accent text-base text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity duration-150 cursor-pointer"
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
                  className="flex-1 h-8 px-2 rounded-lg border border-border text-ink hover:bg-panel-alt text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer"
                >
                  <FolderGit2 size={12} />
                  <span>All Repos</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Zone: Command Palette, Agent Status Pill, Credits, Notifications, Theme, User Menu */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          id="os-terminal-trigger"
          onClick={triggerCommandPalette}
          aria-label="Open Command Palette"
          className="flex items-center gap-2 h-8 px-2 sm:px-2.5 rounded-lg border border-border bg-panel-alt/60 hover:bg-panel-alt text-muted hover:text-ink text-xs transition-colors duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title="Search commands, files, or agents (⌘K)"
        >
          <Search size={13} className="shrink-0" />
          <span className="hidden md:inline font-sans">Search</span>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-panel border border-border text-[10px] font-mono text-muted">
            ⌘K
          </kbd>
        </button>

        {activeAgentCount !== undefined && (
          <button
            type="button"
            id="os-agent-fleet-trigger"
            onClick={() => onOpenAgentFleet && onOpenAgentFleet()}
            aria-label={`Agent Fleet: ${activeAgentCount} active`}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-panel-alt/60 hover:border-accent/40 hover:bg-panel-alt text-xs font-mono text-ink transition-colors duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Inspect Agent Fleet Topology"
          >
            <span className="w-2 h-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
            <Bot size={13} className="text-muted" />
            <span className="hidden lg:inline text-[11px] text-muted">Fleet</span>
            <span className="font-semibold text-ok">{activeAgentCount}</span>
          </button>
        )}

        <NavLink
          to="/billing"
          id="os-credits-chip"
          className="hidden xl:flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-panel-alt/60 hover:bg-panel-alt text-xs font-mono text-ink transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title="Compute credit quota & billing"
        >
          <Sparkles size={12} className="text-warn shrink-0" />
          <span className="font-semibold">
            {creditsBalance === undefined ? "—" : creditsBalance.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted">CR</span>
        </NavLink>

        <div className="shrink-0">
          <NotificationsBell />
        </div>

        <div className="shrink-0">
          <ThemeToggle compact />
        </div>

        {/* User Account Menu */}
        <div className="relative shrink-0" ref={userMenuRef}>
          <button
            type="button"
            id="os-user-profile-badge"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-expanded={showUserMenu}
            aria-haspopup="true"
            aria-label={`User menu for ${name}`}
            className="w-8 h-8 rounded-full bg-accent text-base font-bold text-xs flex items-center justify-center ring-1 ring-border hover:opacity-90 transition-opacity duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={`Logged in as ${name}`}
          >
            {initial}
          </button>

          {showUserMenu && (
            <div
              role="menu"
              aria-label="User Account Menu"
              className="absolute top-10 right-0 z-50 w-64 rounded-lg bg-panel border border-border shadow-m3-3 p-2 font-mono text-xs space-y-2 text-ink"
            >
              <div className="p-2.5 rounded-lg bg-panel-alt border border-border">
                <div className="font-sans font-semibold text-xs truncate text-ink">
                  {name}
                </div>
                <div className="text-[10px] text-muted truncate">{email}</div>
              </div>

              <div className="space-y-0.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate(projectPath("settings"));
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-panel-alt text-ink text-xs transition-colors duration-150 cursor-pointer"
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-panel-alt text-ink text-xs transition-colors duration-150 cursor-pointer"
                >
                  <CreditCard size={13} className="text-muted" />
                  <span>Billing & Subscriptions</span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/admin-console");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-panel-alt text-ink text-xs transition-colors duration-150 cursor-pointer"
                  >
                    <Shield size={13} className="text-muted" />
                    <span>Admin Governance</span>
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-border">
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-error hover:bg-error/10 text-xs transition-colors duration-150 cursor-pointer"
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
  );
};

export default TopNavBar;
