import React, { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FolderGit2,
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
  X,
  type LucideIcon,
} from "lucide-react";
import { useActiveProject } from "../hooks/useActiveProject";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { LIVE_MODE } from "../lib/env";
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
}

export const LeftNavRail: React.FC<LeftNavRailProps> = ({
  mobileOpen = false,
  onCloseMobile,
}) => {
  const location = useLocation();
  const user = useAuthStore((st) => st.user);
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { activeProject, activeProjectId, projectPath } = useActiveProject();

  const isAdmin = !LIVE_MODE || user?.is_admin === true;

  const prevPathnameRef = useRef(location.pathname);

  // Close mobile drawer only when route actually changes
  useEffect(() => {
    if (prevPathnameRef.current !== location.pathname) {
      prevPathnameRef.current = location.pathname;
      if (mobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    }
  }, [location.pathname, mobileOpen, onCloseMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onCloseMobile) {
        onCloseMobile();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const globalItems: RailNavItem[] = [
    {
      id: "projects",
      to: "/projects",
      label: "Projects",
      icon: FolderGit2,
      match: (p) => p === "/projects",
    },
    {
      id: "new-build",
      to: "/launch",
      label: "New Build",
      icon: Rocket,
      match: (p) => p === "/launch",
    },
    {
      id: "marketplace",
      to: "/marketplace",
      label: "Marketplace",
      icon: Boxes,
      match: (p) => p.startsWith("/marketplace"),
    },
    {
      id: "billing",
      to: "/billing",
      label: "Billing",
      icon: CreditCard,
      match: (p) => p.startsWith("/billing"),
    },
    {
      id: "settings",
      to: "/settings",
      label: "Settings",
      icon: Settings,
      match: (p) => p === "/settings",
    },
    ...(isAdmin
      ? [
          {
            id: "admin-ops",
            to: "/admin",
            label: "Admin Ops",
            icon: Shield,
            match: (p: string) => p.startsWith("/admin"),
          },
        ]
      : []),
  ];

  const projectItems: RailNavItem[] = [
    {
      id: "build",
      to: projectPath("workspace"),
      label: "Build",
      icon: Terminal,
      match: (p) =>
        (p.startsWith("/p/") && p.includes("/workspace")) ||
        p.startsWith("/build/") ||
        p === "/workspace",
    },
    {
      id: "plan",
      to: projectPath("initiatives"),
      label: "Plan",
      icon: Layers,
      match: (p) => p.includes("/initiatives"),
    },
    {
      id: "agents",
      to: projectPath("agents"),
      label: "Agents",
      icon: Bot,
      match: (p) =>
        p.endsWith("/agents") || p.endsWith("/flow") || p === "/agents" || p === "/flow",
    },
    {
      id: "reviews",
      to: projectPath("reviews"),
      label: "Reviews",
      icon: GitCompare,
      match: (p) => p.includes("/reviews"),
    },
    {
      id: "history",
      to: projectPath("history"),
      label: "History",
      icon: Clock,
      match: (p) => p.includes("/history"),
    },
    {
      id: "project-settings",
      to: projectPath("settings"),
      label: "Project Settings",
      icon: SlidersHorizontal,
      match: (p) => p.startsWith("/p/") && p.endsWith("/settings"),
    },
  ];

  const renderNavItem = (item: RailNavItem, isCollapsed: boolean, isMobile = false) => {
    const isActive = item.match(location.pathname);
    const Icon = item.icon;
    return (
      <NavLink
        key={item.id}
        to={item.to}
        id={`rail-nav-${item.id}${isMobile ? "-mobile" : ""}`}
        aria-label={isCollapsed ? item.label : undefined}
        title={isCollapsed ? item.label : undefined}
        onClick={isMobile && onCloseMobile ? onCloseMobile : undefined}
        className={`group flex items-center rounded-lg text-xs font-medium transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          isMobile ? "min-h-[44px] px-3 gap-3" : isCollapsed ? "h-9 w-9 justify-center mx-auto" : "h-9 px-2.5 gap-2.5"
        } ${
          isActive
            ? "bg-accent-soft text-accent font-semibold"
            : "text-muted hover:bg-panel-alt hover:text-ink"
        }`}
      >
        <Icon
          size={16}
          className={`shrink-0 transition-colors duration-150 ${
            isActive ? "text-accent" : "text-muted group-hover:text-ink"
          }`}
        />
        {(!isCollapsed || isMobile) && <span className="truncate">{item.label}</span>}
      </NavLink>
    );
  };

  return (
    <>
      {/* Desktop & Tablet Collapsible Left Navigation Rail */}
      <aside
        id="left-nav-rail"
        aria-label="Workspace Sidebar"
        className={`hidden sm:flex flex-col shrink-0 bg-panel border-r border-border transition-all duration-150 ease-in-out select-none ${
          sidebarCollapsed ? "w-[56px]" : "w-[220px]"
        }`}
      >
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {/* Project 4-Pillar Section */}
          <nav aria-label="Project Navigation" className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-2.5 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted truncate">
                  {activeProject?.name ?? (activeProjectId ? activeProjectId : "Project")}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {projectItems.map((item) => renderNavItem(item, sidebarCollapsed))}
            </div>
          </nav>

          {/* Divider */}
          <div className="border-t border-border mx-1" />

          {/* Global Section */}
          <nav aria-label="Global Navigation" className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-2.5 pb-1">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted">
                  Workspace
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {globalItems.map((item) => renderNavItem(item, sidebarCollapsed))}
            </div>
          </nav>
        </div>

        {/* Collapse / Expand Footer Toggle */}
        <div className="p-2 border-t border-border shrink-0">
          <button
            type="button"
            id="rail-collapse-toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`w-full flex items-center rounded-lg h-9 text-xs font-medium text-muted hover:bg-panel-alt hover:text-ink transition-colors duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              sidebarCollapsed ? "justify-center" : "px-2.5 gap-2.5"
            }`}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} className="shrink-0" />
            ) : (
              <>
                <PanelLeftClose size={16} className="shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile (<640px) Slide-Over Navigation Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-150"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="fixed inset-y-0 left-0 w-[260px] max-w-[85vw] bg-panel border-r border-border flex flex-col z-50 transition-transform duration-150 ease-in-out"
          >
            {/* Drawer Header */}
            <div className="h-14 px-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BrandLogo size="xs" />
                <span className="font-mono font-bold text-xs tracking-wider uppercase text-ink">
                  FORGE
                </span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted hover:bg-panel-alt hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              <nav aria-label="Mobile Project Navigation" className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted truncate">
                  {activeProject?.name ?? (activeProjectId ? activeProjectId : "Project")}
                </div>
                <div className="space-y-1">
                  {projectItems.map((item) => renderNavItem(item, false, true))}
                </div>
              </nav>

              <div className="border-t border-border" />

              <nav aria-label="Mobile Global Navigation" className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted">
                  Workspace
                </div>
                <div className="space-y-1">
                  {globalItems.map((item) => renderNavItem(item, false, true))}
                </div>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LeftNavRail;

