import { Loader2, Check, Zap } from "lucide-react";
import type { Agent } from "../lib/agents";
import { agentById } from "../lib/agents";

export type AgentState = "idle" | "active" | "done" | "debugging";

export interface PipelineNode {
  id: Agent["id"];
  state: AgentState;
  detail?: string;
  showCredits?: boolean;
}

export interface AgentPipelineProps {
  nodes: PipelineNode[];
  orientation?: "vertical";
  compact?: boolean;
}

export function AgentPipeline({ nodes, compact = false }: AgentPipelineProps) {
  const tileSz = compact ? 28 : 34;
  const iconSz = compact ? 12 : 14;
  const connectorMinH = compact ? 10 : 18;

  return (
    <ol aria-label="Agent pipeline">
      {nodes.map((node, i) => {
        const agent = agentById(node.id);
        const isLast = i === nodes.length - 1;
        const Icon = agent.icon;

        const labelClass = [
          compact ? "text-xs" : "text-sm",
          "font-medium leading-none",
          node.state === "idle"
            ? "text-faint"
            : node.state === "debugging"
            ? "text-warn"
            : "text-ink",
        ].join(" ");

        const detailClass = [
          compact ? "text-[10px]" : "text-xs",
          "mt-0.5",
          node.state === "debugging" ? "text-warn" : "text-muted",
        ].join(" ");

        return (
          <li
            key={node.id}
            aria-label={`${agent.label}: ${node.state}`}
            className="flex gap-3"
          >
            {/* Track column: tile + connector */}
            <div
              className="flex flex-col items-center shrink-0"
              style={{ width: tileSz }}
            >
              {/* Tile */}
              {node.state === "active" ? (
                <div
                  className="relative shrink-0"
                  style={{ width: tileSz, height: tileSz }}
                >
                  <span
                    className="absolute inset-0 rounded-lg animate-ping motion-reduce:hidden"
                    style={{ backgroundColor: `${agent.hue}4D` }}
                    aria-hidden="true"
                  />
                  <div
                    className="relative w-full h-full rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: agent.hue,
                      boxShadow: `0 0 14px ${agent.hue}55`,
                    }}
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
                      : node.state === "debugging"
                      ? "bg-warn/[0.08] border-warn/25"
                      : "",
                  ].join(" ")}
                  style={{
                    width: tileSz,
                    height: tileSz,
                    ...(node.state === "done"
                      ? {
                          backgroundColor: `${agent.hue}1F`,
                          borderColor: `${agent.hue}44`,
                        }
                      : {}),
                  }}
                >
                  {node.state === "done" ? (
                    <Check
                      size={iconSz}
                      style={{ color: agent.hue }}
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon
                      size={iconSz}
                      className={
                        node.state === "idle" ? "text-faint" : "text-warn"
                      }
                      aria-hidden="true"
                    />
                  )}
                </div>
              )}

              {/* Connector below this tile */}
              {!isLast && (
                <div
                  className={`flex-1 w-0.5 ${
                    node.state !== "done" ? "bg-border" : ""
                  }`}
                  style={{
                    minHeight: connectorMinH,
                    ...(node.state === "done"
                      ? { backgroundColor: `${agent.hue}80` }
                      : {}),
                  }}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Content column */}
            <div
              className={[
                "flex-1 flex items-start justify-between min-w-0",
                isLast ? "pb-0" : compact ? "pb-3" : "pb-5",
              ].join(" ")}
            >
              <div className="min-w-0">
                <p className={labelClass}>{agent.label}</p>
                {node.detail && (
                  <p className={detailClass}>{node.detail}</p>
                )}
              </div>
              {node.showCredits && (
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <Zap
                    size={10}
                    className="text-faint"
                    aria-hidden="true"
                  />
                  <span
                    className={`${
                      compact ? "text-[10px]" : "text-xs"
                    } font-mono text-faint`}
                  >
                    {agent.credits}
                  </span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
