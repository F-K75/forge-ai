import { RunSectionLabel, RunCard } from "../AgentRunShell";

export interface ScrumRollup {
  onTrack: number;
  blocked: number;
  atRisk: number;
  blockerNote?: string;
}

export function ScrumMasterPane({ rollup }: { rollup: ScrumRollup }) {
  return (
    <div className="flex flex-col gap-2.5">
      <RunSectionLabel>Standup summary</RunSectionLabel>
      <RunCard>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-ink">On track</span>
          <span className="font-mono tabular-nums text-ok">{rollup.onTrack}</span>
        </div>
      </RunCard>
      <RunCard>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-ink">Blocked</span>
          <span className="font-mono tabular-nums text-error">{rollup.blocked}</span>
        </div>
        {rollup.blockerNote && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{rollup.blockerNote}</p>
        )}
      </RunCard>
      <RunCard>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-ink">At risk</span>
          <span className="font-mono tabular-nums text-warn">{rollup.atRisk}</span>
        </div>
      </RunCard>
    </div>
  );
}
