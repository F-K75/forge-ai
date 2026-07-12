import { RunSectionLabel } from "../AgentRunShell";

export interface DesignerOption {
  label: string;
  recommended?: boolean;
  rendering?: boolean;
}

export function DesignerPane({ options }: { options: DesignerOption[] }) {
  return (
    <div>
      <RunSectionLabel>Layout options</RunSectionLabel>
      <div className="grid grid-cols-3 gap-2.5">
        {options.map((o) => (
          <div
            key={o.label}
            className={`flex aspect-[4/3] flex-col gap-1.5 rounded-lg border p-2.5 ${
              o.recommended ? "border-accent/40 bg-accent-soft" : "bb-card"
            } ${o.rendering ? "opacity-60" : ""}`}
          >
            <p className={`text-[10.5px] ${o.recommended ? "text-accent" : "text-faint"}`}>
              {o.label}
              {o.recommended && " ★"}
            </p>
            <div
              className={`flex flex-1 flex-col justify-center gap-1 rounded-md border border-dashed p-2 ${
                o.recommended ? "border-accent/40" : "border-border"
              }`}
            >
              {!o.rendering && (
                <>
                  <div className="h-1.5 w-2/3 rounded bg-border" />
                  <div className="h-3.5 w-full rounded bg-panel-alt" />
                  <div className="mt-1 h-2.5 w-2/5 rounded bg-accent/40" />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
