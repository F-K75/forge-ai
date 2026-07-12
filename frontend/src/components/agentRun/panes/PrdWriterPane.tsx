export interface PrdWriterPaneProps {
  sections: string[];
  activeSectionIndex: number;
  activeHeading: string;
  activeBody: string;
}

export function PrdWriterPane({ sections, activeSectionIndex, activeHeading, activeBody }: PrdWriterPaneProps) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-5">
      <div className="border-r border-border-soft pr-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-faint">Contents</p>
        <div className="flex flex-col gap-2 text-xs">
          {sections.map((s, i) => (
            <span
              key={s}
              className={
                i === activeSectionIndex
                  ? "text-accent font-medium"
                  : i < activeSectionIndex
                  ? "text-ink"
                  : "text-muted"
              }
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-faint">
          {activeSectionIndex + 1}. {sections[activeSectionIndex]}
        </p>
        <h4 className="mb-2 text-sm font-semibold text-ink font-display">{activeHeading}</h4>
        <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{activeBody}</p>
      </div>
    </div>
  );
}
