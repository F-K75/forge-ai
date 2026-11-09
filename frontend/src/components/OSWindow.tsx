import React, { useState } from "react";
import { Minus, Square, X, RefreshCw, type LucideIcon } from "lucide-react";

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
  status = "READY",
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
    if (onMaximize) {
      onMaximize();
    } else {
      setIsMaximized((prev) => !prev);
    }
  };

  const handleToggleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      setIsMinimized((prev) => !prev);
    }
  };

  const statusColorMap = {
    ready: "bg-emerald-400 text-black border-black dark:border-white",
    busy: "bg-amber-400 text-black border-black dark:border-white animate-pulse",
    warn: "bg-rose-400 text-black border-black dark:border-white",
    idle: "bg-neutral-300 text-black border-black dark:border-white",
  };

  return (
    <section
      id={id}
      className={`relative flex flex-col border-2 border-black dark:border-white/80 bg-white dark:bg-[#18181C] text-ink select-none transition-all duration-100 ${
        isMaximized
          ? "w-full h-full shadow-none"
          : "w-full h-full shadow-[4px_4px_0px_0px_#000] dark:shadow-[4px_4px_0px_0px_#fff]"
      } ${className}`}
    >
      {/* OS Window Title Bar */}
      <div className="h-10 px-3 bg-[#EFECE6] dark:bg-[#202028] border-b-2 border-black dark:border-white/80 flex items-center justify-between shrink-0 gap-2 font-mono">
        {/* Left: Window Icon + Monospace Title + Status Pill */}
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div className="w-5 h-5 flex items-center justify-center text-black dark:text-white shrink-0">
              <Icon size={14} className="stroke-[2.5]" />
            </div>
          )}
          <h2 className="font-mono font-black text-xs uppercase tracking-wider text-black dark:text-white truncate">
            {title}
          </h2>
          {status && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border-2 ${
                statusColorMap[statusVariant]
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white inline-block" />
              {status}
            </span>
          )}
        </div>

        {/* Center: Extra Header Content (tabs, submenus, breadcrumbs) */}
        {extraHeader && (
          <div className="hidden md:flex items-center gap-1.5 min-w-0">
            {extraHeader}
          </div>
        )}

        {/* Right: Classic OS Control Buttons [ _ ] [ □ ] [ ✕ ] */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Minimize Button [ _ ] */}
          <button
            type="button"
            id={`${id || "win"}-btn-minimize`}
            onClick={handleToggleMinimize}
            title={isMinimized ? "Restore Window" : "Minimize Window"}
            className="w-6 h-6 border-2 border-black dark:border-white/80 bg-white dark:bg-[#282832] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black flex items-center justify-center text-ink font-mono font-bold text-xs shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <Minus size={11} strokeWidth={3} />
          </button>

          {/* Maximize Button [ □ ] */}
          <button
            type="button"
            id={`${id || "win"}-btn-maximize`}
            onClick={handleToggleMaximize}
            title={isMaximized ? "Restore Window" : "Maximize Window"}
            className="w-6 h-6 border-2 border-black dark:border-white/80 bg-white dark:bg-[#282832] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black flex items-center justify-center text-ink font-mono font-bold text-xs shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <Square size={10} strokeWidth={2.5} />
          </button>

          {/* Close Button [ ✕ ] */}
          <button
            type="button"
            id={`${id || "win"}-btn-close`}
            onClick={() => {
              if (onClose) onClose();
              else setIsMinimized(true);
            }}
            title="Close Window"
            className="w-6 h-6 border-2 border-black dark:border-white/80 bg-white dark:bg-[#282832] hover:bg-rose-500 hover:text-white hover:border-black flex items-center justify-center text-ink font-mono font-bold text-xs shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <X size={11} strokeWidth={3} />
          </button>
        </div>
      </div>

      {/* Window Body Canvas */}
      {!isMinimized ? (
        <div className={`flex-1 min-h-0 relative overflow-auto bg-white dark:bg-[#18181C] ${bodyClassName}`}>
          {children}
        </div>
      ) : (
        <div className="p-3 bg-[#F4F0EA] dark:bg-[#1A1A22] text-xs font-mono text-muted flex items-center justify-between">
          <span>Window minimized to taskbar.</span>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="px-2 py-1 bg-white dark:bg-[#2A2A35] border-2 border-black dark:border-white text-ink font-bold shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
          >
            Restore
          </button>
        </div>
      )}
    </section>
  );
}
