import { RunSectionLabel, RunCard } from "../AgentRunShell";

export interface StoryRow {
  statement: string;
  acceptanceCriteria: string[];
  generating?: boolean;
}

export function StoryGeneratorPane({ stories }: { stories: StoryRow[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <RunSectionLabel>Stories</RunSectionLabel>
      {stories.map((s, i) => (
        <RunCard key={i}>
          <p className={`text-[13px] font-semibold ${s.generating ? "text-muted" : "text-ink"}`}>{s.statement}</p>
          {s.generating ? (
            <p className="mt-2 font-mono text-[10.5px] text-faint">generating acceptance criteria…</p>
          ) : (
            <>
              <p className="mb-1.5 mt-2 text-[10px] uppercase tracking-wider text-faint">Acceptance criteria</p>
              <ul className="flex flex-col gap-1 text-xs text-muted">
                {s.acceptanceCriteria.map((c, j) => (
                  <li key={j}>
                    <span className="text-ok">✓</span> {c}
                  </li>
                ))}
              </ul>
            </>
          )}
        </RunCard>
      ))}
    </div>
  );
}
