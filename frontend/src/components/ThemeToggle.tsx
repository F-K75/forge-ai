import { useEffect, useState } from "react";
import { Moon, Sun, Contrast } from "lucide-react";
import { applyTheme, getStoredTheme, type ThemeMode } from "../lib/theme";

const LABELS: Record<ThemeMode, string> = {
  dark: "Dark",
  light: "Light",
  "high-contrast": "High contrast",
};

const ORDER: ThemeMode[] = ["dark", "light", "high-contrast"];

const ICONS = {
  dark: Moon,
  light: Sun,
  "high-contrast": Contrast,
} as const;

type Props = {
  className?: string;
  /** Compact icon-only control for the shell nav */
  compact?: boolean;
};

export function ThemeToggle({ className = "", compact = false }: Props) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const Icon = ICONS[mode];

  const defaultClasses = compact
    ? "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-glass-border bg-glass text-muted transition-colors duration-fast hover:bg-ink/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    : "bb-btn bb-btn-icon bb-btn-subtle gap-2 px-3";

  return (
    <button
      type="button"
      onClick={() =>
        setMode((m) => ORDER[(ORDER.indexOf(m) + 1) % ORDER.length]!)
      }
      className={`${defaultClasses} ${className}`.trim()}
      aria-label={`Theme: ${LABELS[mode]}. Click to cycle.`}
      title={`Theme: ${LABELS[mode]}`}
    >
      <Icon size={compact ? 13 : 16} strokeWidth={2.5} aria-hidden="true" />
      {!compact && <span className="text-caption">{LABELS[mode]}</span>}
    </button>
  );
}

/** Segmented control for Settings → Appearance */
export function ThemeSegmented({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {ORDER.map((value) => {
        const Icon = ICONS[value];
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setMode(value)}
            className={["bb-chip", selected ? "bb-chip-selected" : ""].join(" ")}
          >
            <Icon size={14} aria-hidden="true" />
            {LABELS[value]}
          </button>
        );
      })}
    </div>
  );
}
