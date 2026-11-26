import React from "react";
import { ArrowUpRight } from "lucide-react";

export interface BottomNavItem {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  isExternal?: boolean;
  badge?: string | number;
  hoverColor?: string;
  icon?: React.ReactNode;
}

export type SuiNavItem = BottomNavItem;

export interface SuiWindowFrameProps {
  title: string;
  tagText?: string;
  tagLabel?: string;
  subtitle?: string;
  topRightContent?: React.ReactNode;
  navItems?: BottomNavItem[];
  bottomNavItems?: BottomNavItem[];
  navPosition?: "top" | "bottom";
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    loading?: boolean;
    disabled?: boolean;
  };
  children: React.ReactNode;
  className?: string;
}

export function SuiWindowFrame({
  title,
  tagText = "Active Cycle",
  tagLabel,
  subtitle,
  topRightContent,
  navItems,
  bottomNavItems = [],
  navPosition = "top",
  primaryAction,
  children,
  className = "",
}: SuiWindowFrameProps) {
  const effectiveNavItems = navItems || bottomNavItems;

  const renderNav = (position: "top" | "bottom") => {
    if (!effectiveNavItems || effectiveNavItems.length === 0) return null;
    const borderClass = position === "top" ? "border-b border-border" : "border-t border-border";

    return (
      <nav
        aria-label="Section Navigation"
        data-testid="sui-nav-bar"
        className={`shrink-0 ${borderClass} bg-panel px-3 sm:px-5 overflow-x-auto scrollbar-none z-10`}
      >
        <div className="flex items-center justify-between gap-4 min-w-max py-2">
          <div className="flex items-center gap-0.5">
            {effectiveNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                aria-pressed={item.isActive}
                className={`relative flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-pill px-3.5 py-1.5 text-xs sm:text-[13px] font-medium transition-colors duration-fast cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  item.isActive ? "bg-ink/[0.08] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="font-mono text-[11px] text-faint tabular-nums">
                    {item.badge}
                  </span>
                )}
                {item.isExternal && <ArrowUpRight size={13} className="opacity-70" />}
              </button>
            ))}
          </div>

          {primaryAction && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-accent/25 bg-accent/[0.12] px-3.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {primaryAction.icon}
                <span>{primaryAction.label}</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    );
  };

  return (
    <div className={`relative flex w-full flex-1 flex-col p-4 sm:p-6 ${className}`}>
      <div className="relative flex w-full flex-1 min-h-[640px] flex-col overflow-hidden rounded-xl border border-border bg-panel">
        {/* Studio Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-5 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="truncate font-display text-base font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {subtitle && (
              <span className="hidden md:inline truncate text-xs text-muted">
                · {subtitle}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {topRightContent ? (
              topRightContent
            ) : (
              <div className="flex items-center gap-1.5 font-mono text-xs">
                {tagLabel && <span className="text-muted">{tagLabel}:</span>}
                <span className="font-medium text-ink">{tagText}</span>
              </div>
            )}
          </div>
        </div>

        {navPosition === "top" && renderNav("top")}

        {/* Main Workspace Canvas */}
        <div className="relative flex-1 overflow-y-auto bg-base/40 p-5 sm:p-6 md:p-7">
          {children}
        </div>

        {navPosition === "bottom" && renderNav("bottom")}
      </div>
    </div>
  );
}
