import { Loader2, Check, X, Bot } from "lucide-react";

// Visually consistent with components/AgentPipeline.tsx (same base/panel/ink tokens,
// ping-halo/spinner for active, check for done) but NOT a reuse of it: review
// agent ids come from agents/*.json (config-driven, can grow) rather than the
// fixed roster in lib/agents.ts, so there's no per-agent icon/hue lookup here
// — just one consistent accent color and a humanized id as the label.
export type ReviewAgentState = "idle" | "active" | "done" | "failed";

export interface ReviewPipelineNode {
  id: string;
  state: ReviewAgentState;
  detail?: string;
}

export interface ReviewAgentPipelineProps {
  nodes: ReviewPipelineNode[];
  compact?: boolean;
}

const ACCENT = "#7C5CFF";
const FAILED = "#EF4444";

function humanize(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ReviewAgentPipeline({ nodes, compact = false }: ReviewAgentPipelineProps) {
  const tileSz = compact ? 28 : 34;
  const iconSz = compact ? 12 : 14;
  const connectorMinH = compact ? 10 : 18;

  return (
    <ol aria-label="Review agent pipeline">
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const label = humanize(node.id);

        const labelClass = [
          compact ? "text-xs" : "text-sm",
          "font-medium leading-none",
          node.state === "idle" ? "text-faint" : node.state === "failed" ? "text-error" : "text-ink",
        ].join(" ");

        const detailClass = [
          compact ? "text-[10px]" : "text-xs",
          "mt-0.5",
          node.state === "failed" ? "text-error" : "text-muted",
        ].join(" ");

        return (
          <li key={node.id} aria-label={`${label}: ${node.state}`} className="flex gap-3">
            {/* Track column: tile + connector */}
            <div className="flex flex-col items-center shrink-0" style={{ width: tileSz }}>
              {node.state === "active" ? (
                <div className="relative shrink-0" style={{ width: tileSz, height: tileSz }}>
                  <span
                    className="absolute inset-0 rounded-lg animate-ping motion-reduce:hidden"
                    style={{ backgroundColor: `${ACCENT}4D` }}
                    aria-hidden="true"
                  />
                  <div
                    className="relative w-full h-full rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: ACCENT, boxShadow: `0 0 14px ${ACCENT}55` }}
                  >
                    <Loader2
                      size={iconSz}
                      className="animate-spin motion-reduce:animate-none text-white"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={[
                    "rounded-lg border flex items-center justify-center shrink-0",
                    node.state === "idle"
                      ? "bg-panel-alt border-border"
                      : node.state === "failed"
                      ? "bg-error/[0.08] border-error/25"
                      : "",
                  ].join(" ")}
                  style={{
                    width: tileSz,
                    height: tileSz,
                    ...(node.state === "done"
                      ? { backgroundColor: `${ACCENT}1F`, borderColor: `${ACCENT}44` }
                      : {}),
                  }}
                >
                  {node.state === "done" ? (
                    <Check size={iconSz} style={{ color: ACCENT }} aria-hidden="true" />
                  ) : node.state === "failed" ? (
                    <X size={iconSz} style={{ color: FAILED }} aria-hidden="true" />
                  ) : (
                    <Bot size={iconSz} className="text-faint" aria-hidden="true" />
                  )}
                </div>
              )}

              {!isLast && (
                <div
                  className={`flex-1 w-0.5 ${node.state !== "done" ? "bg-border" : ""}`}
                  style={{
                    minHeight: connectorMinH,
                    ...(node.state === "done" ? { backgroundColor: `${ACCENT}80` } : {}),
                  }}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Content column */}
            <div className={["flex-1 min-w-0", isLast ? "pb-0" : compact ? "pb-3" : "pb-5"].join(" ")}>
              <p className={labelClass}>{label}</p>
              {node.detail && <p className={detailClass}>{node.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
