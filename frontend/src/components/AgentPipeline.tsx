import { useRef, useEffect } from "react"
import { Loader2, Check, Zap } from "lucide-react"
import type { Agent } from "../lib/agents"
import { agentById } from "../lib/agents"
import gsap from "gsap"
import { useReducedMotion } from "motion/react"

export type AgentState = "idle" | "active" | "done" | "debugging"

export interface PipelineNode {
  id: Agent["id"]
  state: AgentState
  detail?: string
  showCredits?: boolean
}

export interface AgentPipelineProps {
  nodes: PipelineNode[]
  orientation?: "vertical"
  compact?: boolean
}

export function AgentPipeline({ nodes, compact = false }: AgentPipelineProps) {
  const tileSz = compact ? 28 : 34
  const iconSz = compact ? 12 : 14
  const connectorMinH = compact ? 10 : 18
  const listRef = useRef<HTMLOListElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion || !listRef.current) return
    const items = listRef.current.querySelectorAll("[data-pipeline-node]")
    gsap.from(items, {
      opacity: 0,
      x: -16,
      scale: 0.92,
      stagger: 0.07,
      duration: 0.45,
      ease: "power3.out",
    })
  }, [nodes, reduceMotion])

  return (
    <ol ref={listRef} aria-label="Agent pipeline">
      {nodes.map((node, i) => {
        const agent = agentById(node.id)
        if (!agent) return null
        const isLast = i === nodes.length - 1
        const Icon = agent.icon

        const labelClass = [
          compact ? "text-xs" : "text-sm",
          "font-medium leading-none",
          node.state === "idle"
            ? "text-faint"
            : node.state === "debugging"
            ? "text-warn"
            : "text-ink",
        ].join(" ")

        const detailClass = [
          compact ? "text-[10px]" : "text-xs",
          "mt-0.5",
          node.state === "debugging" ? "text-warn" : "text-muted",
        ].join(" ")

        return (
          <li
            key={node.id}
            data-pipeline-node
            aria-label={`${agent.label}: ${node.state}`}
            className="flex gap-3 group"
          >
            <div
              className="flex flex-col items-center shrink-0"
              style={{ width: tileSz }}
            >
              {node.state === "active" ? (
                <div
                  className="relative shrink-0"
                  style={{ width: tileSz, height: tileSz }}
                >
                  <span
                    className="absolute inset-0 rounded-lg bg-ink/30 animate-ping motion-reduce:hidden"
                    aria-hidden="true"
                  />
                  <div className="relative w-full h-full rounded-lg bg-ink flex items-center justify-center">
                    <Loader2
                      size={iconSz}
                      className="animate-spin motion-reduce:animate-none text-base"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={[
                    "rounded-lg border flex items-center justify-center shrink-0",
                    "transition-transform duration-200 group-hover:scale-110",
                    node.state === "idle"
                      ? "border-border"
                      : node.state === "debugging"
                      ? "bg-warn/[0.08] border-warn/25"
                      : "border-ink/40",
                  ].join(" ")}
                  style={{ width: tileSz, height: tileSz }}
                >
                  {node.state === "done" ? (
                    <Check size={iconSz} className="text-ink" aria-hidden="true" />
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

              {!isLast && (
                <div
                  className={`flex-1 w-0.5 ${
                    node.state === "done" ? "bg-ink/40" : "bg-border"
                  }`}
                  style={{ minHeight: connectorMinH }}
                  aria-hidden="true"
                />
              )}
            </div>

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
        )
      })}
    </ol>
  )
}
