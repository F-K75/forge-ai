import React from "react";
import {
  X,
  Activity,
  Flame,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import type { GraphDiagnostics } from "./graphTypes";

interface GraphDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: GraphDiagnostics;
  onSelectNode: (nodeId: string) => void;
}

export const GraphDiagnosticsModal: React.FC<GraphDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  diagnostics,
  onSelectNode,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostics-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-inlay bg-[#111119] shadow-2xl text-xs overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-inlay p-4 bg-inlay/40">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent">
              <Activity size={16} />
            </span>
            <div>
              <h2 id="diagnostics-modal-title" className="font-display text-sm font-semibold text-ink">
                Topology Diagnostics & Dependency Health
              </h2>
              <p className="text-[11px] text-faint">
                Algorithmic graph analysis, critical path validation, and bottleneck identification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint hover:text-ink hover:bg-inlay transition-all"
            aria-label="Close Diagnostics"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-inlay bg-inlay/20 p-3">
              <span className="text-[10px] uppercase font-semibold text-faint block mb-1">
                DAG Acyclicity
              </span>
              <div className="flex items-center gap-1.5">
                {diagnostics.hasCycles ? (
                  <>
                    <AlertTriangle size={14} className="text-red-400" />
                    <span className="font-semibold text-red-300">Cycles Found</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="font-semibold text-emerald-300">Strict DAG</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-inlay bg-inlay/20 p-3">
              <span className="text-[10px] uppercase font-semibold text-faint block mb-1">
                Critical Path
              </span>
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-pink-400" />
                <span className="font-semibold text-ink font-mono">
                  {diagnostics.criticalPathLength} hops
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-inlay bg-inlay/20 p-3">
              <span className="text-[10px] uppercase font-semibold text-faint block mb-1">
                Execution Constraints
              </span>
              <div className="flex items-center gap-1.5">
                <GitBranch size={14} className="text-amber-400" />
                <span className="font-semibold text-ink font-mono">
                  {diagnostics.dependencyEdges} rules
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-inlay bg-inlay/20 p-3">
              <span className="text-[10px] uppercase font-semibold text-faint block mb-1">
                Parallelism Index
              </span>
              <div className="flex items-center gap-1.5">
                <TrendingUp size={14} className="text-cyan-400" />
                <span className="font-semibold text-ink font-mono">
                  {diagnostics.parallelismIndex}x streams
                </span>
              </div>
            </div>
          </div>

          {/* Critical Path Sequence */}
          <div className="rounded-xl border border-inlay bg-inlay/20 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-pink-400" />
                <h3 className="font-semibold text-ink">Critical Path Dependency Sequence</h3>
              </div>
              <span className="text-[10px] text-faint">Longest delivery timeline</span>
            </div>

            {diagnostics.criticalPathNodes.length === 0 ? (
              <p className="text-faint">No critical path detected.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {diagnostics.criticalPathNodes.map((nodeId, idx) => (
                  <div
                    key={nodeId}
                    className="flex items-center gap-2 rounded-lg border border-inlay/60 bg-inlay/40 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-[10px] font-semibold text-pink-400 shrink-0">
                      Step {idx + 1}
                    </span>
                    <span className="font-mono text-ink truncate select-all">{nodeId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNode(nodeId);
                        onClose();
                      }}
                      className="ml-auto text-[11px] font-medium text-accent hover:underline flex items-center gap-0.5 shrink-0"
                    >
                      Focus <ArrowRight size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Bottlenecks (High fan-out) */}
          <div className="rounded-xl border border-inlay bg-inlay/20 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-400" />
                <h3 className="font-semibold text-ink">High-Impact Bottleneck Nodes</h3>
              </div>
              <span className="text-[10px] text-faint">Nodes blocking downstream tasks</span>
            </div>

            {diagnostics.bottlenecks.length === 0 ? (
              <div className="text-faint text-center py-2">
                No high-fanout bottlenecks detected; work streams are well-partitioned.
              </div>
            ) : (
              <div className="space-y-2">
                {diagnostics.bottlenecks.map((b) => (
                  <div
                    key={b.nodeId}
                    className="flex items-center justify-between rounded-lg border border-inlay/60 bg-inlay/30 px-3 py-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase font-semibold text-amber-400">
                          {b.type}
                        </span>
                        <span className="font-medium text-ink">{b.label}</span>
                      </div>
                      <span className="text-[10px] text-faint">
                        {b.dependentsCount} downstream work items waiting on this node
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectNode(b.nodeId);
                        onClose();
                      }}
                      className="rounded bg-accent/20 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/30 transition-all"
                    >
                      Inspect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-inlay p-3.5 bg-inlay/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent/90 transition-all"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
