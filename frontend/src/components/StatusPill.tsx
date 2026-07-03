import { COLORS } from "../lib/theme";

type Status = "complete" | "debugging" | "failed" | "running" | "pending" | "consolidating";

const MAP: Record<Status, { label: string; color: string }> = {
  complete:      { label: "complete",      color: COLORS.ok },
  running:       { label: "running",       color: COLORS.accent },
  debugging:     { label: "debugging",     color: COLORS.warn },
  failed:        { label: "failed",        color: COLORS.error },
  pending:       { label: "pending",       color: COLORS.muted },
  consolidating: { label: "consolidating", color: COLORS.accent },
};

export function StatusPill({ status }: { status: Status }) {
  const s = MAP[status];
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full text-center"
      style={{ background: `${s.color}1A`, color: s.color }}
    >
      {s.label}
    </span>
  );
}
