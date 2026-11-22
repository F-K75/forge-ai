import { COLORS } from "../lib/theme";

type Status = "complete" | "debugging" | "failed" | "running" | "pending" | "consolidating";

const MAP: Record<Status, { label: string; color: string }> = {
  complete: { label: "Complete", color: COLORS.ok },
  running: { label: "Running", color: COLORS.accent },
  debugging: { label: "Debugging", color: COLORS.warn },
  failed: { label: "Failed", color: COLORS.error },
  pending: { label: "Pending", color: COLORS.muted },
  consolidating: { label: "Consolidating", color: COLORS.accent },
};

export function StatusPill({ status }: { status: Status }) {
  const s = MAP[status] ?? MAP.pending;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: s.color }}
        aria-hidden="true"
      />
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  );
}
