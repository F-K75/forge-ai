import React, { useState } from "react";
import { Maximize2, Minimize2, Minus, X, type LucideIcon } from "lucide-react";

/**
 * Window chrome used by the Forge OS window manager (src/os/shell/WindowManager)
 * and by any page that wants a framed panel. Controlled when `maximized` /
 * `minimized` are passed; otherwise it keeps its own state (legacy usage).
 *
 * Linear-like precision: one hairline, a 40px title bar, monochrome window
 * controls on the left (macOS order: close, minimise, zoom) that reveal their
 * glyphs on hover or focus, and no decorative chrome.
 */
export interface OSWindowProps {
  id?: string;
  title: string;
  icon?: LucideIcon | React.ComponentType<{ size?: number; className?: string }>;
  status?: string;
  statusVariant?: "ready" | "busy" | "warn" | "idle";
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  children: React.ReactNode;
  /** Extra controls on the right of the title bar (presentation switcher, nav…). */
  extraHeader?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  initialMaximized?: boolean;
  /** Controlled maximised state (window manager). */
  maximized?: boolean;
  /** Controlled minimised state; the window manager hides minimised windows instead. */
  minimized?: boolean;
  /** Focused windows get a stronger hairline and shadow. */
  focused?: boolean;
  /** Drag handle: pointer-down on the title bar (not on its buttons). */
  onTitlePointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTitleDoubleClick?: () => void;
  /** Accessible name id for role="dialog"/"region" containers. */
  titleId?: string;
  role?: "region" | "dialog";
  ariaModal?: boolean;
  style?: React.CSSProperties;
  onPointerDownCapture?: (e: React.PointerEvent<HTMLElement>) => void;
  onFocusCapture?: (e: React.FocusEvent<HTMLElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  /** Hide the minimise button (panels, mobile sheets). */
  hideMinimize?: boolean;
  dataAttrs?: Record<string, string>;
}

export function OSWindow({
  id,
  title,
  icon: Icon,
  status = "Ready",
  statusVariant = "ready",
  onClose,
  onMinimize,
  onMaximize,
  children,
  extraHeader,
  className = "",
  bodyClassName = "",
  initialMaximized = false,
  maximized,
  minimized,
  focused = true,
  onTitlePointerDown,
  onTitleDoubleClick,
  titleId,
  role,
  ariaModal,
  style,
  onPointerDownCapture,
  onFocusCapture,
  onKeyDown,
  hideMinimize = false,
  dataAttrs,
}: OSWindowProps) {
  const [localMax, setLocalMax] = useState(initialMaximized);
  const [localMin, setLocalMin] = useState(false);
  const isMaximized = maximized ?? localMax;
  const isMinimized = minimized ?? localMin;
  const headingId = titleId ?? (id ? `${id}-title` : undefined);

  const handleToggleMaximize = () => {
    if (onMaximize) onMaximize();
    else setLocalMax((prev) => !prev);
  };

  const handleToggleMinimize = () => {
    if (onMinimize) onMinimize();
    else setLocalMin((prev) => !prev);
  };

  const statusDotClass = {
    ready: "bg-ok",
    busy: "bg-warn",
    warn: "bg-error",
    idle: "bg-faint",
  }[statusVariant];

  const control =
    "group/ctl flex h-3 w-3 items-center justify-center rounded-full bg-ink/[0.16] text-transparent transition-colors duration-fast hover:bg-ink/30 hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <section
      id={id}
      role={role}
      aria-modal={ariaModal}
      aria-labelledby={headingId}
      style={style}
      onPointerDownCapture={onPointerDownCapture}
      onFocusCapture={onFocusCapture}
      onKeyDown={onKeyDown}
      {...dataAttrs}
      className={`relative flex flex-col overflow-hidden border bg-panel text-ink transition-[box-shadow,border-color] duration-fast ${
        focused ? "border-border shadow-brutal-lg" : "border-border-soft shadow-brutal-md"
      } ${isMaximized ? "rounded-none sm:rounded-lg" : "rounded-lg"} ${className}`}
    >
      <div
        className={`flex h-10 shrink-0 select-none items-center gap-3 border-b border-border-soft px-3 ${
          focused ? "bg-panel-alt/70" : "bg-panel"
        } ${onTitlePointerDown ? "cursor-default touch-none" : ""}`}
        onPointerDown={onTitlePointerDown}
        onDoubleClick={onTitleDoubleClick}
      >
        <div className="group flex shrink-0 items-center gap-2" data-window-controls="">
          <button
            type="button"
            id={`${id || "win"}-btn-close`}
            onClick={() => {
              if (onClose) onClose();
              else setLocalMin(true);
            }}
            aria-label={`Close ${title}`}
            title="Close"
            className={control}
          >
            <X size={8} strokeWidth={3} aria-hidden="true" />
          </button>
          {!hideMinimize && (
            <button
              type="button"
              id={`${id || "win"}-btn-minimize`}
              onClick={handleToggleMinimize}
              aria-label={isMinimized ? `Restore ${title}` : `Minimize ${title}`}
              title={isMinimized ? "Restore" : "Minimize"}
              className={control}
            >
              <Minus size={8} strokeWidth={3} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            id={`${id || "win"}-btn-maximize`}
            onClick={handleToggleMaximize}
            aria-label={isMaximized ? `Restore ${title} size` : `Maximize ${title}`}
            aria-pressed={isMaximized}
            title={isMaximized ? "Restore size" : "Maximize"}
            className={control}
          >
            {isMaximized ? (
              <Minimize2 size={7} strokeWidth={3} aria-hidden="true" />
            ) : (
              <Maximize2 size={7} strokeWidth={3} aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {Icon && (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">
              <Icon size={13} />
            </span>
          )}
          <h2
            id={headingId}
            className={`truncate text-caption font-medium tracking-tight ${focused ? "text-ink" : "text-muted"}`}
          >
            {title}
          </h2>
          {status && (
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} aria-hidden="true" />
              <span>{status}</span>
            </span>
          )}
        </div>

        {extraHeader && <div className="flex min-w-0 shrink-0 items-center gap-1">{extraHeader}</div>}
      </div>

      {!isMinimized ? (
        <div className={`relative min-h-0 flex-1 overflow-auto bg-panel ${bodyClassName}`}>{children}</div>
      ) : (
        <div className="flex items-center justify-between bg-panel-alt px-4 py-2.5 text-xs text-muted">
          <span>Panel collapsed</span>
          <button
            type="button"
            onClick={() => setLocalMin(false)}
            className="rounded-pill border border-border bg-panel px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-panel-alt"
          >
            Restore
          </button>
        </div>
      )}
    </section>
  );
}
