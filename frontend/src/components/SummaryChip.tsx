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
    <div className="bg-panel border border-border rounded-xl px-4 py-3">
      <p className="text-[10px] text-faint mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={`font-mono text-base font-bold ${
            warn ? "text-warn" : "text-ink"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
