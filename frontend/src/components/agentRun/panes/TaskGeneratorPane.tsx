import { RunSectionLabel } from "../AgentRunShell";

export interface TaskRow {
  title: string;
  layer: "backend" | "frontend" | "test";
  dependsOn?: string;
  estimate: string;
}

export function TaskGeneratorPane({ tasks }: { tasks: TaskRow[] }) {
  return (
    <div>
      <RunSectionLabel>Tasks</RunSectionLabel>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border-soft text-left text-[10px] uppercase tracking-wider text-faint">
              <th className="pb-2 pr-3 font-medium">Task</th>
              <th className="pb-2 pr-3 font-medium">Layer</th>
              <th className="pb-2 pr-3 font-medium">Depends on</th>
              <th className="pb-2 font-medium text-right">Est.</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.title} className="border-b border-border-soft last:border-0">
                <td className="py-2.5 pr-3 text-ink">{t.title}</td>
                <td className="py-2.5 pr-3">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10.5px] text-muted">
                    {t.layer}
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-mono text-muted">{t.dependsOn ?? "—"}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-muted">{t.estimate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
