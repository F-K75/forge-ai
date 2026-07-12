import { RunSectionLabel, RunCard, RunStatusPill } from "../AgentRunShell";

export interface ConnectedSystem {
  label: string;
  ok: boolean;
}

export function IntegrationPane({ systems }: { systems: ConnectedSystem[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <RunSectionLabel>Connected systems</RunSectionLabel>
      {systems.map((s) => (
        <RunCard key={s.label}>
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-ink">{s.label}</span>
            <RunStatusPill status={s.ok ? "done" : "needs_review"} label={s.ok ? "ok" : "check"} />
          </div>
        </RunCard>
      ))}
    </div>
  );
}
