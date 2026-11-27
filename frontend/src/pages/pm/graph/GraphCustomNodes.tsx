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
          ? "border-agent-business-improver/30 ring-2 ring-agent-business-improver/30 scale-[1.02]"
          : "border-agent-business-improver/40 hover:border-agent-business-improver/30"
      } bg-panel-alt ${data.density === "compact" ? "p-2.5 w-[200px]" : "p-3.5 w-[260px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-agent-business-improver !w-2.5 !h-2.5 !border-2 !border-border"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-agent-business-improver !w-2.5 !h-2.5 !border-2 !border-border"
      />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-agent-business-improver">
          <Rocket size={12} className="shrink-0" />
          Initiative Root
        </span>
        <span className="rounded-full bg-agent-business-improver/15 px-2 py-0.5 text-[10px] font-medium text-agent-business-improver">
          {data.status || "Active"}
        </span>
      </div>

      <h4 className="font-display text-xs font-semibold text-ink line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && data.description && (
        <p className="mt-1.5 text-[11px] text-faint line-clamp-2 leading-relaxed">
          {data.description}
        </p>
      )}

      {data.density !== "compact" && (
        <div className="mt-2.5 flex items-center justify-between border-t border-border-soft pt-1.5 text-[10px] text-faint">
          <span className="text-agent-business-improver font-medium">Enterprise Scope</span>
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
          ? "border-agent-designer/80 ring-2 ring-agent-designer/20"
          : selected || isHighlighted
          ? "border-agent-business-improver/30 ring-2 ring-agent-business-improver/30 scale-[1.02]"
          : "border-agent-business-improver/30 hover:border-agent-business-improver/80"
      } bg-panel-alt ${data.density === "compact" ? "p-2 w-[180px]" : "p-3 w-[240px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-agent-business-improver !w-2.5 !h-2.5 !border-2 !border-border"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-agent-business-improver !w-2.5 !h-2.5 !border-2 !border-border"
      />

      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-agent-business-improver">
          <Zap size={11} className="shrink-0 text-agent-business-improver" />
          Epic
        </span>
        <div className="flex items-center gap-1">
          {data.isCriticalPath && (
            <span className="flex items-center gap-0.5 rounded bg-agent-designer/20 px-1 py-0.2 text-[9px] font-semibold text-agent-designer">
              <Flame size={9} /> Path
            </span>
          )}
          <span className="rounded bg-agent-business-improver/20 px-1.5 py-0.2 text-[10px] font-mono text-agent-business-improver">
            {data.priority || "P1"}
          </span>
        </div>
      </div>

      <h4 className="text-xs font-medium text-ink line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-faint border-t border-border-soft pt-1">
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
          ? "border-agent-designer/80 ring-2 ring-agent-designer/20"
          : selected || isHighlighted
          ? "border-info/30 ring-2 ring-info/30 scale-[1.02]"
          : "border-info/30 hover:border-info/80"
      } bg-panel-alt ${data.density === "compact" ? "p-2 w-[180px]" : "p-3 w-[230px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-info !w-2.5 !h-2.5 !border-2 !border-border"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-info !w-2.5 !h-2.5 !border-2 !border-border"
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-accent">
          <BookOpen size={11} className="shrink-0" />
          Story
        </span>
        <span className="rounded bg-info/20 px-1.5 py-0.2 text-[10px] font-mono text-accent">
          {data.points ? `${data.points} pts` : "3 pts"}
        </span>
      </div>

      <h4 className="text-xs font-medium text-ink line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-faint border-t border-border-soft pt-1">
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
          ? "border-warn/80 ring-2 ring-warn/20 bg-panel-alt"
          : data.isCriticalPath
          ? "border-agent-designer/80 ring-2 ring-agent-designer/20 bg-panel-alt"
          : isDone
          ? "border-ok/40 bg-panel-alt"
          : selected || isHighlighted
          ? "border-ok/30 ring-2 ring-ok/30 scale-[1.02] bg-panel-alt"
          : "border-ok/30 hover:border-ok/70 bg-panel-alt"
      } ${data.density === "compact" ? "p-2 w-[180px]" : "p-3 w-[230px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className={`!w-2.5 !h-2.5 !border-2 !border-border ${
          isBlocked ? "!bg-warn" : "!bg-ok"
        }`}
      />
      <Handle
        type="source"
        position={sourcePos}
        className={`!w-2.5 !h-2.5 !border-2 !border-border ${
          isBlocked ? "!bg-warn" : "!bg-ok"
        }`}
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-ok">
          {isDone ? (
            <CheckCircle2 size={11} className="text-ok" />
          ) : (
            <CheckSquare size={11} className="text-ok" />
          )}
          Task
        </span>
        <div className="flex items-center gap-1">
          {isBlocked && (
            <span className="flex items-center gap-0.5 rounded bg-warn/20 px-1 py-0.2 text-[9px] font-semibold text-warn animate-pulse">
              <AlertTriangle size={9} /> Blocked
            </span>
          )}
          <span className="rounded bg-ok/15 px-1.5 py-0.2 text-[10px] font-mono text-ok">
            {data.priority || "P1"}
          </span>
        </div>
      </div>

      <h4 className="text-xs font-medium text-ink line-clamp-2 leading-tight">
        {data.title || data.label}
      </h4>

      {data.density !== "compact" && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-faint border-t border-border-soft pt-1">
          <span className="flex items-center gap-1 truncate max-w-[120px]">
            <User size={10} className="shrink-0 text-faint" />
            {data.assignee || "AI Core"}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} className="shrink-0 text-faint" />
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
          ? "border-warn/30 ring-2 ring-warn/30 animate-pulse bg-panel-alt"
          : selected || isHighlighted
          ? "border-accent/30 ring-2 ring-accent/30 scale-[1.02] bg-panel-alt"
          : "border-accent/30 hover:border-accent/80 bg-panel-alt"
      } ${data.density === "compact" ? "p-2 w-[170px]" : "p-2.5 w-[210px]"}`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-accent !w-2.5 !h-2.5 !border-2 !border-border"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-accent !w-2.5 !h-2.5 !border-2 !border-border"
      />

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-warn">
          <Bot size={11} className="shrink-0" />
          Agent Run
        </span>
        <span
          className={`rounded px-1.5 py-0.2 text-[9px] font-mono uppercase ${
            isRunning
              ? "bg-warn/20 text-warn"
              : "bg-ink/10 text-muted"
          }`}
        >
          {data.status || "ready"}
        </span>
      </div>

      <h4 className="text-xs font-medium text-ink line-clamp-1 leading-tight">
        {data.agent || data.label}
      </h4>

      {data.density !== "compact" && (
        <p className="mt-1 text-[10px] text-faint truncate">
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
          ? "border-transparent ring-2 ring-info/30 scale-[1.02] bg-panel-alt"
          : "border-border hover:border-border bg-panel-alt"
      } p-2 w-[180px]`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-ink/30 !w-2 !h-2 !border-2 !border-border"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-ink/30 !w-2 !h-2 !border-2 !border-border"
      />

      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <FileCode size={12} className="shrink-0 text-accent" />
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
          ? "border-transparent ring-2 ring-agent-business-improver/30 scale-[1.02] bg-panel-alt"
          : "border-border hover:border-border bg-panel-alt"
      } p-2 w-[160px]`}
      id={`graph-node-${data.id}`}
    >
      <Handle
        type="target"
        position={targetPos}
        className="!bg-ink/30 !w-2 !h-2 !border-2 !border-border"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!bg-ink/30 !w-2 !h-2 !border-2 !border-border"
      />

      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <GitCommit size={12} className="shrink-0 text-agent-business-improver" />
        <span className="font-mono text-[10px] text-agent-business-improver">{data.label}</span>
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
