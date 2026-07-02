type Status = "complete" | "debugging" | "failed" | "running" | "pending" | "consolidating";

const MAP: Record<Status, { label: string; color: string }> = {
  complete:      { label: "complete",      color: "#34D399" },
  running:       { label: "running",       color: "#7C5CFF" },
  debugging:     { label: "debugging",     color: "#F59E0B" },
  failed:        { label: "failed",        color: "#EF4444" },
  pending:       { label: "pending",       color: "#8B8B9E" },
  consolidating: { label: "consolidating", color: "#7C5CFF" },
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
