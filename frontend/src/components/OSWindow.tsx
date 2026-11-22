import React, { useState } from "react";
import { Minus, Square, X, type LucideIcon } from "lucide-react";

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
  extraHeader?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  initialMaximized?: boolean;
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
}: OSWindowProps) {
  const [isMaximized, setIsMaximized] = useState(initialMaximized);
  const [isMinimized, setIsMinimized] = useState(false);

  const handleToggleMaximize = () => {
    if (onMaximize) onMaximize();
    else setIsMaximized((prev) => !prev);
  };

  const handleToggleMinimize = () => {
    if (onMinimize) onMinimize();
    else setIsMinimized((prev) => !prev);
  };

  const statusDotClass = {
    ready: "bg-ok",
    busy: "bg-warn",
    warn: "bg-error",
    idle: "bg-faint",
  }[statusVariant];

  return (
    <section
      id={id}
      className={`relative flex flex-col overflow-hidden rounded-lg border border-border bg-panel text-ink shadow-apple transition-all duration-fast ${
        isMaximized ? "w-full h-full" : "w-full h-full"
      } ${className}`}
    >
      {/* Studio Window Header */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-panel-alt/60 px-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">
              <Icon size={14} />
            </span>
          )}
          <h2 className="truncate font-display text-xs font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {status && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <span className="text-border">·</span>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} aria-hidden="true" />
              <span>{status}</span>
            </span>
          )}
        </div>

        {extraHeader && (
          <div className="hidden md:flex min-w-0 items-center gap-1.5">{extraHeader}</div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            id={`${id || "win"}-btn-minimize`}
            onClick={handleToggleMinimize}
            title={isMinimized ? "Restore Window" : "Minimize Window"}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-high hover:text-ink"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            id={`${id || "win"}-btn-maximize`}
            onClick={handleToggleMaximize}
            title={isMaximized ? "Restore Window" : "Maximize Window"}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-high hover:text-ink"
          >
            <Square size={10} />
          </button>
          <button
            type="button"
            id={`${id || "win"}-btn-close`}
            onClick={() => {
              if (onClose) onClose();
              else setIsMinimized(true);
            }}
            title="Close Window"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-error/10 hover:text-error"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Window Body */}
      {!isMinimized ? (
        <div className={`relative flex-1 min-h-0 overflow-auto bg-panel ${bodyClassName}`}>
          {children}
        </div>
      ) : (
        <div className="flex items-center justify-between bg-panel-alt px-4 py-2.5 text-xs text-muted">
          <span>Panel collapsed</span>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="rounded-md border border-border bg-panel px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-panel-alt"
          >
            Restore
          </button>
        </div>
      )}
    </section>
  );
}
