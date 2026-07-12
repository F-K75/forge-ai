import { RunSectionLabel, RunCard } from "../AgentRunShell";

export interface DecisionOption {
  name: string;
  engCost: string;
  timeToShip: string;
  supportLoad: string;
  score: number;
  recommended?: boolean;
}

export interface DecisionEnginePaneProps {
  options: DecisionOption[];
  recommendation: string;
  onApprove?: () => void;
  onRequestRevision?: () => void;
}

export function DecisionEnginePane({
  options,
  recommendation,
  onApprove,
  onRequestRevision,
}: DecisionEnginePaneProps) {
  return (
    <div>
      <RunSectionLabel>Option matrix — weighted score</RunSectionLabel>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border-soft text-left text-[10px] uppercase tracking-wider text-faint">
              <th className="pb-2 pr-3 font-medium">Option</th>
              <th className="pb-2 pr-3 font-medium">Eng. cost</th>
              <th className="pb-2 pr-3 font-medium">Time to ship</th>
              <th className="pb-2 pr-3 font-medium">Support load ↓</th>
              <th className="pb-2 font-medium text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr
                key={o.name}
                className={`border-b border-border-soft last:border-0 ${o.recommended ? "bg-accent-soft" : ""}`}
              >
                <td className="py-2.5 pr-3">
                  <span className={o.recommended ? "font-semibold text-ink" : "text-ink"}>{o.name}</span>
                </td>
                <td className="py-2.5 pr-3 text-muted">{o.engCost}</td>
                <td className="py-2.5 pr-3 text-muted">{o.timeToShip}</td>
                <td className="py-2.5 pr-3 text-muted">{o.supportLoad}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">
                  {o.recommended ? <b>{o.score.toFixed(1)}</b> : o.score.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3.5">
        <RunCard>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">Recommendation</p>
          <p className="text-[12.5px] leading-relaxed text-muted">{recommendation}</p>
        </RunCard>
      </div>

      <div className="mt-4 flex gap-2 border-t border-border-soft pt-4">
        <button type="button" onClick={onApprove} className="bb-btn bb-btn-primary">
          Approve recommendation
        </button>
        <button type="button" onClick={onRequestRevision} className="bb-btn bb-btn-subtle">
          Request revision
        </button>
      </div>
    </div>
  );
}
