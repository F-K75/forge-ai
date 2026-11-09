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
  tagLabel?: string; // e.g. "date" or "initiative" or "status"
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

const TAB_HOVER_COLORS = [
  "hover:bg-[#4DA2FE] hover:text-white",
  "hover:bg-[#FFD731] hover:text-[#000F1D]",
  "hover:bg-[#FF7A00] hover:text-white",
  "hover:bg-[#E9CCFF] hover:text-[#000F1D]",
  "hover:bg-[#55DB9C] hover:text-[#000F1D]",
  "hover:bg-[#5C4ADE] hover:text-white",
  "hover:bg-[#4DF766] hover:text-[#000F1D]",
  "hover:bg-[#FF6ADA] hover:text-white",
  "hover:bg-[#F79F4D] hover:text-white",
  "hover:bg-[#6DE6F8] hover:text-[#000F1D]",
];

export function SuiWindowFrame({
  title,
  tagText = "February–August, 2025",
  tagLabel = "date",
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
    const borderClass =
      position === "top"
        ? "border-b-2 border-[#000F1D]"
        : "border-t-2 border-[#000F1D]";

    return (
      <nav
        aria-label="Initiative Navigation"
        data-testid="sui-nav-bar"
        className={`shrink-0 ${borderClass} bg-white dark:bg-[#141824] overflow-x-auto scrollbar-none z-10`}
      >
        <div className="flex items-stretch divide-x-2 divide-[#000F1D] min-w-max">
          {effectiveNavItems.map((item, idx) => {
            const hoverClass =
              item.hoverColor || TAB_HOVER_COLORS[idx % TAB_HOVER_COLORS.length];
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                aria-pressed={item.isActive}
                className={`
                  relative min-h-[44px] px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-black tracking-tight
                  transition-all duration-150 flex items-center gap-2 cursor-pointer whitespace-nowrap
                  outline-none focus-visible:ring-2 focus-visible:ring-[#4DA2FE] focus-visible:z-20
                  ${
                    item.isActive
                      ? "bg-[#000F1D] text-white dark:bg-white dark:text-[#000F1D]"
                      : `text-neutral-800 dark:text-neutral-200 ${hoverClass}`
                  }
                `}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                      item.isActive
                        ? "bg-neutral-800 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900"
                        : "bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {item.isExternal && (
                  <ArrowUpRight size={13} strokeWidth={2.5} className="opacity-80" />
                )}
              </button>
            );
          })}

          {/* Trailing Highlighted Action Button (e.g. Ask Copilot / Create Initiative) */}
          {primaryAction && (
            <div className="ml-auto pl-3 flex items-center pr-3 py-1.5">
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.loading}
                className="min-h-[40px] px-5 sm:px-6 rounded-xl bg-[#000F1D] hover:bg-neutral-800 text-white dark:bg-white dark:text-[#000F1D] dark:hover:bg-neutral-100 text-xs sm:text-sm font-black tracking-tight transition-all duration-150 active:translate-y-0.5 active:shadow-none shadow-[2.5px_2.5px_0_#000F1D] flex items-center gap-2 cursor-pointer disabled:opacity-50 border-2 border-[#000F1D] outline-none focus-visible:ring-2 focus-visible:ring-[#4DA2FE]"
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
    <div
      className={`relative w-full flex-1 flex flex-col rounded-[24px] sm:rounded-[32px] md:rounded-[40px] bg-[#4DA2FE] dark:bg-[#1D4ED8] p-2 sm:p-4 md:p-5 shadow-[0_12px_0_#000F1D] border-2 border-[#000F1D] transition-all ${className}`}
    >
      {/* Outer Window Container */}
      <div className="relative flex flex-col w-full flex-1 min-h-[680px] rounded-[18px] sm:rounded-[26px] bg-[#F6F6F5] dark:bg-[#0D121F] border-2 border-[#000F1D] overflow-hidden shadow-[0_8px_0_#000F1D]">
        {/* =========================================================================
            1. TOP WINDOW BAR STRIP
        ========================================================================= */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 border-b-2 border-[#000F1D] bg-white dark:bg-[#151926] shrink-0">
          {/* Left: Window Indicator & Monospace Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-3 w-3 rounded-full bg-[#10B981] border-2 border-[#000F1D] shadow-[1px_1px_0_#000F1D] shrink-0 animate-pulse" />
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono font-black text-xs sm:text-sm tracking-wider text-[#000F1D] dark:text-white uppercase truncate">
                {title}
              </span>
              {subtitle && (
                <span className="hidden md:inline text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate">
                  // {subtitle}
                </span>
              )}
            </div>
          </div>

          {/* Right: Code-Snippet Pill Badge or Custom Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {topRightContent ? (
              topRightContent
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1 rounded-full bg-[#000F1D] text-white text-[11px] sm:text-xs font-mono border border-neutral-800 shadow-[2px_2px_0_rgba(0,0,0,0.2)]">
                <span className="text-[#4DA2FE] font-bold">&lt;{tagLabel}&gt;</span>
                <span className="font-semibold text-neutral-100">{tagText}</span>
                <span className="text-[#4DA2FE] font-bold">&lt;/{tagLabel}&gt;</span>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            2. NAVIGATION DOCK (PLACED ABOVE THE MAIN CANVAS / UI COMPONENT)
        ========================================================================= */}
        {navPosition === "top" && renderNav("top")}

        {/* =========================================================================
            3. MAIN CANVAS WITH SUBTLE TECH/GRAPH GRID
        ========================================================================= */}
        <div
          className="flex-1 overflow-y-auto relative p-4 sm:p-6 md:p-8"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(0, 15, 29, 0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0, 15, 29, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: "28px 28px",
          }}
        >
          {children}
        </div>

        {/* =========================================================================
            4. BOTTOM NAVIGATION DOCK (ONLY IF EXPLICITLY SET TO BOTTOM)
        ========================================================================= */}
        {navPosition === "bottom" && renderNav("bottom")}
      </div>
    </div>
  );
}
