import { RunCard, RunSectionLabel } from "../AgentRunShell";

export interface BusinessAnalystPaneProps {
  problem: string;
  users: string[];
  assumptions: { text: string; flagged?: boolean }[];
}

export function BusinessAnalystPane({ problem, users, assumptions }: BusinessAnalystPaneProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <RunSectionLabel>Brief outline</RunSectionLabel>
      <RunCard>
        <p className="mb-1.5 text-[13px] font-semibold text-ink">Problem statement</p>
        <p className="text-[12.5px] leading-relaxed text-muted">{problem}</p>
      </RunCard>
      <RunCard>
        <p className="mb-1.5 text-[13px] font-semibold text-ink">Primary users</p>
        <div className="flex flex-wrap gap-1.5">
          {users.map((u) => (
            <span key={u} className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted">
              {u}
            </span>
          ))}
        </div>
      </RunCard>
      <RunCard>
        <p className="mb-1.5 text-[13px] font-semibold text-ink">
          Assumptions{" "}
          <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-faint">
            {assumptions.filter((a) => a.flagged).length} flagged
          </span>
        </p>
        <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed">
          {assumptions.map((a, i) => (
            <li key={i} className={a.flagged ? "text-warn" : "text-muted"}>
              — {a.flagged ? <>Unconfirmed: {a.text}</> : a.text}
            </li>
          ))}
        </ul>
      </RunCard>
    </div>
  );
}
