import { RunSectionLabel } from "../AgentRunShell";

export interface CapacityRow {
  team: string;
  used: number;
  capacity: number;
}

export function SprintPlannerPane({
  rows,
  onApprove,
  onRebalance,
}: {
  rows: CapacityRow[];
  onApprove?: () => void;
  onRebalance?: () => void;
}) {
  return (
    <div>
      <RunSectionLabel>Capacity vs. committed</RunSectionLabel>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const pct = Math.min(100, Math.round((r.used / r.capacity) * 100));
          const over = r.used > r.capacity;
          return (
            <div key={r.team} className="bb-card p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-ink">{r.team}</span>
                <span className={`font-mono tabular-nums ${over ? "text-warn" : "text-muted"}`}>
                  {r.used}h / {r.capacity}h
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-panel-alt">
                <div
                  className={`h-full rounded-full ${over ? "bg-warn" : pct > 80 ? "bg-ok" : "bg-accent"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2 border-t border-border-soft pt-4">
        <button type="button" onClick={onApprove} className="bb-btn bb-btn-primary">
          Approve sprint
        </button>
        <button type="button" onClick={onRebalance} className="bb-btn bb-btn-subtle">
          Rebalance backend
        </button>
      </div>
    </div>
  );
}
