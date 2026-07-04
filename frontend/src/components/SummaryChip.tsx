import type { ReactNode } from "react";

export function SummaryChip({
  label,
  value,
  icon,
  warn = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="bg-base px-4 py-3.5">
      <p className="text-[10px] uppercase tracking-[0.1em] text-faint mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={`font-mono text-base font-medium ${
            warn ? "text-warn" : "text-ink"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
