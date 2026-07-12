import { RunSectionLabel } from "../AgentRunShell";
import type { RunLogLine } from "../AgentRunShell";

const EMPHASIS_CLASS: Record<NonNullable<RunLogLine["emphasis"]>, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  error: "text-error",
};

export function TaskExecutorPane({ lines }: { lines: RunLogLine[] }) {
  return (
    <div className="-m-5 rounded-l-2xl bg-panel-alt p-5 md:rounded-l-2xl md:rounded-r-none">
      <RunSectionLabel>Execution log</RunSectionLabel>
      <div className="flex flex-col gap-2 font-mono text-[11.5px] leading-relaxed">
        {lines.map((l, i) => (
          <div key={i}>
            <span className="text-faint">[{l.time}]</span>{" "}
            <span className={l.emphasis ? EMPHASIS_CLASS[l.emphasis] : "text-muted"}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
