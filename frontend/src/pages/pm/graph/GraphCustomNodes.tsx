import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  Rocket,
  Zap,
  BookOpen,
  CheckSquare,
  Bot,
  FileCode,
  GitCommit,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Clock,
  User,
} from "lucide-react";
import type { GraphNodePayload } from "./graphTypes";

function getHandles(layoutMode?: string) {
  const isVertical = layoutMode === "vertical";
  const targetPos = isVertical ? Position.Top : Position.Left;
  const sourcePos = isVertical ? Position.Bottom : Position.Right;
  return { targetPos, sourcePos };
}

export const InitiativeNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 select-none shadow-md ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        selected || isHighlighted
          ? "border-[#7C5CFF] ring-2 ring-[#7C5CFF]/30 scale-[1.02]"
          : "border-[#7C5CFF]/40 hover:border-[#7C5CFF]"
      } bg-[#13131F] ${data.density === "compact" ? "p-2.5 w-[200px]" : "p-3.5 w-[260px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-[#7C5CFF] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-[#7C5CFF] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A78BFA]">
          <Rocket size={12} className="shrink-0" />
          Initiative Root
        </span>
        <span className="rounded-full bg-[#7C5CFF]/15 px-2 py-0.5 text-[10px] font-medium text-[#C4B5FD]">
          {data.status || "Active"}
        </span>
      </div>

      <h4 className="font-display text-xs font-semibold text-[#F3F4F6] line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && data.description && (
        <p className="mt-1.5 text-[11px] text-[#9CA3AF] line-clamp-2 leading-relaxed">
          {data.description}
        </p>
      )}

      {data.density !== "compact" && (
        <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-1.5 text-[10px] text-[#9CA3AF]">
          <span className="text-[#A78BFA] font-medium">Enterprise Scope</span>
          <span>Core Horizon</span>
        </div>
      )}
    </div>
  );
};

export const EpicNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 select-none shadow-sm ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        data.isCriticalPath
          ? "border-pink-500/80 ring-2 ring-pink-500/20"
          : selected || isHighlighted
          ? "border-[#A855F7] ring-2 ring-[#A855F7]/30 scale-[1.02]"
          : "border-[#A855F7]/30 hover:border-[#A855F7]/80"
      } bg-[#161626] ${data.density === "compact" ? "p-2 w-[180px]" : "p-3 w-[240px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-[#A855F7] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-[#A855F7] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />

      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#D8B4FE]">
          <Zap size={11} className="shrink-0 text-[#C084FC]" />
          Epic
        </span>
        <div className="flex items-center gap-1">
          {data.isCriticalPath && (
            <span className="flex items-center gap-0.5 rounded bg-pink-500/20 px-1 py-0.2 text-[9px] font-semibold text-pink-300">
              <Flame size={9} /> Path
            </span>
          )}
          <span className="rounded bg-[#A855F7]/20 px-1.5 py-0.2 text-[10px] font-mono text-[#E9D5FF]">
            {data.priority || "P1"}
          </span>
        </div>
      </div>

      <h4 className="text-xs font-medium text-[#F3F4F6] line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-[#9CA3AF] border-t border-white/5 pt-1">
          <span>{data.quarter || "Q1"}</span>
          <span>{data.duration || "2 weeks"}</span>
        </div>
      )}
    </div>
  );
};

export const StoryNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 select-none shadow-sm ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        data.isCriticalPath
          ? "border-pink-500/80 ring-2 ring-pink-500/20"
          : selected || isHighlighted
          ? "border-[#06B6D4] ring-2 ring-[#06B6D4]/30 scale-[1.02]"
          : "border-[#06B6D4]/30 hover:border-[#06B6D4]/80"
      } bg-[#121A24] ${data.density === "compact" ? "p-2 w-[180px]" : "p-3 w-[230px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-[#06B6D4] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-[#06B6D4] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#67E8F9]">
          <BookOpen size={11} className="shrink-0" />
          Story
        </span>
        <span className="rounded bg-[#06B6D4]/20 px-1.5 py-0.2 text-[10px] font-mono text-[#A5F3FC]">
          {data.points ? `${data.points} pts` : "3 pts"}
        </span>
      </div>

      <h4 className="text-xs font-medium text-[#F3F4F6] line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-[#9CA3AF] border-t border-white/5 pt-1">
          <span className="capitalize">{data.status || "todo"}</span>
          <span>{data.priority || "P1"}</span>
        </div>
      )}
    </div>
  );
};

export const TaskNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;
  const isDone = data.status === "done";
  const isBlocked = data.blocked;

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 select-none shadow-sm ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        isBlocked
          ? "border-amber-500/80 ring-2 ring-amber-500/20 bg-[#221B14]"
          : data.isCriticalPath
          ? "border-pink-500/80 ring-2 ring-pink-500/20 bg-[#1A1420]"
          : isDone
          ? "border-emerald-500/40 bg-[#121F1A]"
          : selected || isHighlighted
          ? "border-[#10B981] ring-2 ring-[#10B981]/30 scale-[1.02] bg-[#121F1A]"
          : "border-[#10B981]/30 hover:border-[#10B981]/70 bg-[#121E19]"
      } ${data.density === "compact" ? "p-2 w-[180px]" : "p-3 w-[230px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className={`!w-2.5 !h-2.5 !border-2 !border-[#0D0D14] ${
          isBlocked ? "!bg-amber-400" : "!bg-[#10B981]"
        }`}
      />
      <Handle
        type="source"
        position={sourcePos}
        className={`!w-2.5 !h-2.5 !border-2 !border-[#0D0D14] ${
          isBlocked ? "!bg-amber-400" : "!bg-[#10B981]"
        }`}
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#6EE7B7]">
          {isDone ? (
            <CheckCircle2 size={11} className="text-emerald-400" />
          ) : (
            <CheckSquare size={11} className="text-emerald-400" />
          )}
          Task
        </span>
        <div className="flex items-center gap-1">
          {isBlocked && (
            <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-semibold text-amber-300 animate-pulse">
              <AlertTriangle size={9} /> Blocked
            </span>
          )}
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-mono text-emerald-300">
            {data.priority || "P1"}
          </span>
        </div>
      </div>

      <h4 className="text-xs font-medium text-[#F3F4F6] line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-[#9CA3AF] border-t border-white/5 pt-1">
          <span className="flex items-center gap-1 truncate max-w-[120px]">
            <User size={10} className="shrink-0 text-slate-400" />
            {data.assignee || "AI Core"}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} className="shrink-0 text-slate-400" />
            {data.duration || "4h"}
          </span>
        </div>
      )}
    </div>
  );
};

export const ExecutionNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;
  const isRunning = data.status === "running";

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 select-none shadow-sm ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        isRunning
          ? "border-amber-400 ring-2 ring-amber-400/30 animate-pulse bg-[#241C12]"
          : selected || isHighlighted
          ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 scale-[1.02] bg-[#1E1810]"
          : "border-[#F59E0B]/30 hover:border-[#F59E0B]/80 bg-[#1C160E]"
      } ${data.density === "compact" ? "p-2 w-[170px]" : "p-2.5 w-[210px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-[#F59E0B] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-[#F59E0B] !w-2.5 !h-2.5 !border-2 !border-[#0D0D14]"
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#FCD34D]">
          <Bot size={11} className="shrink-0" />
          Agent Run
        </span>
        <span
          className={`rounded px-1.5 py-0.2 text-[9px] font-mono uppercase ${
            isRunning
              ? "bg-amber-400/20 text-amber-300"
              : "bg-white/10 text-slate-300"
          }`}
        >
          {data.status || "ready"}
        </span>
      </div>

      <h4 className="text-xs font-medium text-[#F3F4F6] line-clamp-1 leading-tight">
        {data.agent || data.label}
      </h4>

      {data.density !== "compact" && (
        <p className="mt-1 text-[10px] text-[#9CA3AF] truncate">
          {data.description || "Synthesizing code artifact"}
        </p>
      )}
    </div>
  );
};

export const FileNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      className={`relative rounded-lg border transition-all duration-200 select-none shadow-sm ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        selected || isHighlighted
          ? "border-sky-400 ring-2 ring-sky-400/30 scale-[1.02] bg-[#161B24]"
          : "border-slate-700/50 hover:border-slate-500 bg-[#12161F]"
      } p-2 w-[180px]`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-slate-400 !w-2 !h-2 !border-2 !border-[#0D0D14]"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-slate-400 !w-2 !h-2 !border-2 !border-[#0D0D14]"
      />

      <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
        <FileCode size={12} className="shrink-0 text-sky-400" />
        <span className="font-mono text-[10px] truncate" title={data.title}>
          {data.label}
        </span>
      </div>
    </div>
  );
};

export const CommitNode: React.FC<NodeProps<GraphNodePayload>> = ({ data, selected }) => {
  const { targetPos, sourcePos } = getHandles(data.layoutMode);
  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      className={`relative rounded-lg border transition-all duration-200 select-none shadow-sm ${
        isDimmed ? "opacity-25" : "opacity-100"
      } ${
        selected || isHighlighted
          ? "border-purple-400 ring-2 ring-purple-400/30 scale-[1.02] bg-[#1A1624]"
          : "border-zinc-700/50 hover:border-zinc-500 bg-[#14141C]"
      } p-2 w-[160px]`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-zinc-400 !w-2 !h-2 !border-2 !border-[#0D0D14]"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-zinc-400 !w-2 !h-2 !border-2 !border-[#0D0D14]"
      />

      <div className="flex items-center gap-1.5 text-[11px] text-zinc-300">
        <GitCommit size={12} className="shrink-0 text-purple-400" />
        <span className="font-mono text-[10px] text-purple-300">{data.label}</span>
      </div>
    </div>
  );
};

export const customNodeTypes = {
  initiative: InitiativeNode,
  epic: EpicNode,
  story: StoryNode,
  task: TaskNode,
  agent_execution: ExecutionNode,
  file: FileNode,
  commit: CommitNode,
};
