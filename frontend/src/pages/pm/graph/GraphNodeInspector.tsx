import React from "react";
import {
  X,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  AlertTriangle,
  ExternalLink,
  Bot,
  User,
  Clock,
  Layers,
} from "lucide-react";
import type { GraphNodePayload } from "./graphTypes";
import { LAYER_CONFIG } from "./graphUtils";
import { useNavigate, useParams } from "react-router-dom";

interface GraphNodeInspectorProps {
  node: GraphNodePayload | null;
  onClose: () => void;
  upstreamNodes: GraphNodePayload[];
  downstreamNodes: GraphNodePayload[];
  onSelectNode: (nodeId: string) => void;
  onCenterNode: (nodeId: string) => void;
}

export const GraphNodeInspector: React.FC<GraphNodeInspectorProps> = ({
  node,
  onClose,
  upstreamNodes,
  downstreamNodes,
  onSelectNode,
  onCenterNode,
}) => {
  const [copied, setCopied] = React.useState(false);
  const navigate = useNavigate();
  const { initiativeId } = useParams<{ initiativeId: string }>();

  if (!node) return null;

  const layerCfg = LAYER_CONFIG[node.type] || LAYER_CONFIG.task;

  const handleCopyId = () => {
    navigator.clipboard.writeText(node.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleNavigateToBoard = () => {
    if (initiativeId) {
      navigate(`/initiatives/${initiativeId}/board`);
    }
  };

  return (
    <aside
      className="absolute top-4 right-4 z-30 w-80 md:w-96 max-h-[calc(100%-32px)] flex flex-col rounded-2xl border border-inlay bg-[#111119]/95 backdrop-blur-md shadow-2xl overflow-hidden text-xs transition-all animate-in slide-in-from-right-4 duration-200"
      aria-label="Node Inspector"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-inlay p-3.5 bg-inlay/30">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: layerCfg.color }}
          >
            <Layers size={13} />
          </span>
          <span className="font-semibold uppercase tracking-wider text-[11px] text-ink">
            {layerCfg.label} Inspector
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyId}
            className="flex items-center gap-1 rounded-md p-1.5 text-faint hover:text-ink hover:bg-inlay transition-all"
            title="Copy Node ID"
            aria-label="Copy Node ID"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-faint hover:text-ink hover:bg-inlay transition-all"
            aria-label="Close Inspector"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content scroll area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Title & Badges */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
              style={{ backgroundColor: layerCfg.bg, color: layerCfg.color }}
            >
              {node.type.toUpperCase()}
            </span>

            {node.priority && (
              <span className="rounded bg-inlay px-1.5 py-0.5 font-mono text-[10px] text-ink">
                {node.priority}
              </span>
            )}

            {node.status && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                  node.status === "done"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : node.status === "in_progress" || node.status === "running"
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-inlay text-faint"
                }`}
              >
                {node.status}
              </span>
            )}

            {node.blocked && (
              <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                <AlertTriangle size={10} /> Blocked
              </span>
            )}

            {node.isCriticalPath && (
              <span className="flex items-center gap-0.5 rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-pink-300">
                <Flame size={10} /> Critical Path
              </span>
            )}
          </div>

          <h3 className="font-display text-sm font-semibold text-ink leading-snug">
            {node.title || node.label}
          </h3>

          <p className="mt-1 font-mono text-[10px] text-faint truncate select-all">
            ID: {node.id}
          </p>
        </div>

        {/* Metadata Details Grid */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-inlay/60 bg-inlay/20 p-2.5">
          {node.assignee && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-faint flex items-center gap-1">
                <User size={10} /> Assignee
              </span>
              <span className="font-medium text-ink truncate">{node.assignee}</span>
            </div>
          )}
          {node.points !== undefined && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-faint">Story Points</span>
              <span className="font-mono font-medium text-ink">{node.points} pts</span>
            </div>
          )}
          {node.duration && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-faint flex items-center gap-1">
                <Clock size={10} /> Duration / Est.
              </span>
              <span className="font-medium text-ink">{node.duration}</span>
            </div>
          )}
          {node.quarter && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-faint">Cadence Horizon</span>
              <span className="font-medium text-ink">{node.quarter}</span>
            </div>
          )}
          {node.agent && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-faint flex items-center gap-1">
                <Bot size={10} /> Agent Runner
              </span>
              <span className="font-medium text-ink">{node.agent}</span>
            </div>
          )}
        </div>

        {/* Description / Scope */}
        {node.description && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint block mb-1">
              Description & Context
            </span>
            <p className="rounded-xl border border-inlay/60 bg-inlay/20 p-2.5 text-xs text-ink/90 leading-relaxed whitespace-pre-wrap">
              {node.description}
            </p>
          </div>
        )}

        {/* Upstream Prerequisites (Ancestors) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1">
              <ArrowUpRight size={12} className="text-sky-400" />
              Upstream Prerequisites ({upstreamNodes.length})
            </span>
          </div>

          {upstreamNodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-inlay/60 p-2 text-center text-faint text-[11px]">
              Root entry point — no parent prerequisites.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {upstreamNodes.map((up) => (
                <button
                  key={up.id}
                  type="button"
                  onClick={() => onSelectNode(up.id)}
                  className="w-full flex items-center justify-between rounded-lg border border-inlay bg-inlay/30 p-2 hover:bg-inlay text-left transition-all"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: LAYER_CONFIG[up.type]?.color }}
                    />
                    <span className="truncate text-ink font-medium">{up.title || up.label}</span>
                  </div>
                  <span className="font-mono text-[10px] text-faint uppercase shrink-0 ml-1">
                    {up.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Downstream Impact (Descendants) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint flex items-center gap-1">
              <ArrowDownRight size={12} className="text-emerald-400" />
              Downstream Impact ({downstreamNodes.length})
            </span>
          </div>

          {downstreamNodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-inlay/60 p-2 text-center text-faint text-[11px]">
              Terminal node — no downstream dependencies.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {downstreamNodes.map((down) => (
                <button
                  key={down.id}
                  type="button"
                  onClick={() => onSelectNode(down.id)}
                  className="w-full flex items-center justify-between rounded-lg border border-inlay bg-inlay/30 p-2 hover:bg-inlay text-left transition-all"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: LAYER_CONFIG[down.type]?.color }}
                    />
                    <span className="truncate text-ink font-medium">
                      {down.title || down.label}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-faint uppercase shrink-0 ml-1">
                    {down.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center gap-2 border-t border-inlay p-3 bg-inlay/30">
        <button
          type="button"
          onClick={() => onCenterNode(node.id)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-inlay bg-inlay/60 py-1.5 text-xs font-medium text-ink hover:bg-inlay transition-all active:scale-95"
        >
          <span>Center Node</span>
        </button>

        {node.type === "task" && (
          <button
            type="button"
            onClick={handleNavigateToBoard}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-all active:scale-95"
          >
            <ExternalLink size={12} />
            <span>Open Board</span>
          </button>
        )}
      </div>
    </aside>
  );
};
