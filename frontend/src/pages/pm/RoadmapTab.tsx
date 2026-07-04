import { usePMStore } from "../../store/pmStore";

export default function RoadmapTab() {
  const { initiative, epics } = usePMStore();
  const roadmap: { phase: string; goal: string; duration: string }[] = initiative?.roadmap ?? [];

  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl">
      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-[0.14em] text-muted mb-5">Roadmap</h2>
        {roadmap.length === 0 ? (
          <p className="text-sm text-faint">Not generated yet.</p>
        ) : (
          <ol className="relative border-l border-border pl-6 space-y-8">
            {roadmap.map((phase, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[29px] top-0.5 w-3 h-3 rounded-full bg-ink border-2 border-base" aria-hidden="true" />
                <p className="text-sm font-medium text-ink mb-0.5">{phase.phase}</p>
                <p className="text-xs text-faint mb-1.5">{phase.duration}</p>
                <p className="text-sm text-muted leading-relaxed">{phase.goal}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.14em] text-muted mb-5">Epics by priority</h2>
        {epics.length === 0 ? (
          <p className="text-sm text-faint">Not generated yet.</p>
        ) : (
          <div className="space-y-2">
            {[...epics]
              .sort((a, b) => a.priority.localeCompare(b.priority))
              .map(epic => (
                <div key={epic.id} className="flex items-center gap-3 py-2 border-b border-border-soft">
                  <span className="text-[10px] font-mono uppercase text-faint w-6 shrink-0">{epic.priority}</span>
                  <span className="text-sm text-ink flex-1 min-w-0 truncate">{epic.title}</span>
                  <span className="text-xs text-muted shrink-0">{epic.estimated_duration}</span>
                  <span className="text-xs text-faint shrink-0 w-16 text-right">{epic.story_points} pts</span>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
