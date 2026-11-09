import React, { useEffect, useState, useCallback, useRef } from "react";
import type { PMTask } from "../../lib/types/api";

export interface DependencyArrowsOverlayProps {
  tasks: PMTask[];
  containerRef: React.RefObject<HTMLDivElement>;
  hoveredTaskId: string | null;
  selectedTaskId: string | null;
  showArrows: boolean;
  onlyBlockers: boolean;
  onHoverTask?: (taskId: string | null) => void;
  onSelectTask?: (taskId: string | null) => void;
}

interface ArrowPathData {
  id: string;
  sourceId: string;
  targetId: string;
  d: string;
  isBlocked: boolean;
  stroke: string;
  strokeDasharray: string;
  markerEnd: string;
  isHighlighted: boolean;
  isDimmed: boolean;
  midX: number;
  midY: number;
  sourceTitle: string;
  targetTitle: string;
}

export const DependencyArrowsOverlay: React.FC<DependencyArrowsOverlayProps> = ({
  tasks,
  containerRef,
  hoveredTaskId,
  selectedTaskId,
  showArrows,
  onlyBlockers,
}) => {
  const [paths, setPaths] = useState<ArrowPathData[]>([]);
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  const animFrameRef = useRef<number | null>(null);

  const calculatePaths = useCallback(() => {
    const container = containerRef.current;
    if (!container || !showArrows) {
      setPaths([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    // Use scrollWidth and scrollHeight so SVG covers the full scrollable surface
    const totalWidth = Math.max(container.scrollWidth, containerRect.width);
    const totalHeight = Math.max(container.scrollHeight, containerRect.height);

    setContainerDimensions({ width: totalWidth, height: totalHeight });

    const tasksById = new Map(tasks.map((t) => [t.id, t]));
    const calculated: ArrowPathData[] = [];

    tasks.forEach((targetTask) => {
      const depIds = targetTask.dependencies || [];
      if (depIds.length === 0) return;

      const targetEl = document.getElementById(`kanban-task-card-${targetTask.id}`);
      if (!targetEl) return;
      const targetRect = targetEl.getBoundingClientRect();

      depIds.forEach((srcId) => {
        const srcTask = tasksById.get(srcId);
        if (!srcTask) return;

        const srcEl = document.getElementById(`kanban-task-card-${srcId}`);
        if (!srcEl) return;
        const srcRect = srcEl.getBoundingClientRect();

        const isBlocked = srcTask.status !== "done";
        if (onlyBlockers && !isBlocked) return;

        // Position coordinates relative to container canvas
        const srcLeft = srcRect.left - containerRect.left + scrollLeft;
        const srcRight = srcRect.right - containerRect.left + scrollLeft;
        const srcCenterY = srcRect.top + srcRect.height / 2 - containerRect.top + scrollTop;

        const targetLeft = targetRect.left - containerRect.left + scrollLeft;
        const targetRight = targetRect.right - containerRect.left + scrollLeft;
        const targetCenterY = targetRect.top + targetRect.height / 2 - containerRect.top + scrollTop;

        let x1: number;
        let y1: number;
        let x2: number;
        let y2: number;
        let d = "";
        let midX = 0;
        let midY = 0;

        // Check relative positions of the two cards
        if (srcRight < targetLeft - 8) {
          // Source is in a column to the left of target
          x1 = srcRight;
          y1 = srcCenterY;
          x2 = targetLeft;
          y2 = targetCenterY;

          const dx = Math.max(40, (x2 - x1) * 0.45);
          d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          midX = (x1 + x2) / 2;
          midY = (y1 + y2) / 2;
        } else if (targetRight < srcLeft - 8) {
          // Source is in a column to the right of target (backward dependency)
          x1 = srcLeft;
          y1 = srcCenterY;
          x2 = targetRight;
          y2 = targetCenterY;

          const dx = Math.max(40, (x1 - x2) * 0.45);
          d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
          midX = (x1 + x2) / 2;
          midY = (y1 + y2) / 2;
        } else {
          // In same column or vertically stacked grid columns
          x1 = srcRight;
          y1 = srcCenterY;
          x2 = targetRight;
          y2 = targetCenterY;

          const loopDist = Math.max(36, Math.min(80, Math.abs(y2 - y1) * 0.25));
          d = `M ${x1} ${y1} C ${x1 + loopDist} ${y1}, ${x2 + loopDist} ${y2}, ${x2} ${y2}`;
          midX = Math.max(x1, x2) + loopDist * 0.75;
          midY = (y1 + y2) / 2;
        }

        const isHighlighted =
          hoveredTaskId === srcId ||
          hoveredTaskId === targetTask.id ||
          selectedTaskId === srcId ||
          selectedTaskId === targetTask.id;

        const isDimmed = Boolean(hoveredTaskId || selectedTaskId) && !isHighlighted;

        calculated.push({
          id: `${srcId}->${targetTask.id}`,
          sourceId: srcId,
          targetId: targetTask.id,
          d,
          isBlocked,
          stroke: isHighlighted
            ? isBlocked
              ? "#BE123C"
              : "#047857"
            : isBlocked
            ? "#E11D48"
            : "#10B981",
          strokeDasharray: isBlocked ? "5 3" : "none",
          markerEnd: isHighlighted
            ? isBlocked
              ? "url(#arrow-blocked-highlight)"
              : "url(#arrow-resolved-highlight)"
            : isBlocked
            ? "url(#arrow-blocked)"
            : "url(#arrow-resolved)",
          isHighlighted,
          isDimmed,
          midX,
          midY,
          sourceTitle: srcTask.title || srcId,
          targetTitle: targetTask.title || targetTask.id,
        });
      });
    });

    setPaths(calculated);
  }, [tasks, containerRef, hoveredTaskId, selectedTaskId, showArrows, onlyBlockers]);

  useEffect(() => {
    const handleRecalc = () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => {
        calculatePaths();
      });
    };

    handleRecalc();

    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleRecalc, { passive: true });
    }
    window.addEventListener("resize", handleRecalc, { passive: true });

    // Periodically sync in case DOM element heights change or cards animate
    const timer = setTimeout(handleRecalc, 120);

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleRecalc);
      }
      window.removeEventListener("resize", handleRecalc);
      clearTimeout(timer);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [calculatePaths, containerRef]);

  if (!showArrows || paths.length === 0) return null;

  return (
    <svg
      id="kanban-dependency-arrows-svg"
      className="pointer-events-none absolute inset-0 z-10 overflow-visible transition-opacity duration-200"
      style={{
        width: containerDimensions.width || "100%",
        height: containerDimensions.height || "100%",
        minWidth: "100%",
        minHeight: "100%",
      }}
      aria-label="Kanban task dependency blocker connector arrows"
    >
      <defs>
        {/* Normal Blocked Arrowhead */}
        <marker
          id="arrow-blocked"
          markerWidth="8"
          markerHeight="8"
          refX="6.5"
          refY="4"
          orient="auto"
        >
          <polygon points="0 1, 7.5 4, 0 7" fill="#E11D48" />
        </marker>

        {/* Highlighted Blocked Arrowhead */}
        <marker
          id="arrow-blocked-highlight"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
        >
          <polygon
            points="0 1.5, 9 5, 0 8.5"
            fill="#BE123C"
            stroke="#000"
            strokeWidth="1"
          />
        </marker>

        {/* Normal Resolved Arrowhead */}
        <marker
          id="arrow-resolved"
          markerWidth="8"
          markerHeight="8"
          refX="6.5"
          refY="4"
          orient="auto"
        >
          <polygon points="0 1, 7.5 4, 0 7" fill="#10B981" />
        </marker>

        {/* Highlighted Resolved Arrowhead */}
        <marker
          id="arrow-resolved-highlight"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
        >
          <polygon
            points="0 1.5, 9 5, 0 8.5"
            fill="#047857"
            stroke="#000"
            strokeWidth="1"
          />
        </marker>
      </defs>

      {paths.map((p) => {
        const opacity = p.isDimmed ? 0.15 : p.isHighlighted ? 1 : 0.75;
        const strokeWidth = p.isHighlighted ? 3.5 : p.isBlocked ? 2.2 : 1.8;

        return (
          <g key={p.id} className="transition-opacity duration-150">
            {/* White background halo for crisp contrast against column borders and card shadows */}
            <path
              d={p.d}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={strokeWidth + 2.5}
              strokeOpacity={opacity * 0.9}
            />

            {/* Dependency Connector Line */}
            <path
              id={`dependency-arrow-${p.sourceId}-${p.targetId}`}
              d={p.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={p.strokeDasharray}
              markerEnd={p.markerEnd}
              strokeOpacity={opacity}
            />

            {/* If actively blocking, display a prominent visual "BLOCKS" badge at the center of the arrow */}
            {p.isBlocked && !p.isDimmed && (
              <g
                transform={`translate(${p.midX}, ${p.midY})`}
                className="pointer-events-auto cursor-help"
              >
                <rect
                  x="-23"
                  y="-9"
                  width="46"
                  height="17"
                  fill="#FFE4E6"
                  stroke="#E11D48"
                  strokeWidth="1.5"
                  rx="3"
                  className="shadow-xs"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill="#9F1239"
                  fontSize="8.5"
                  fontWeight="900"
                  fontFamily="monospace"
                >
                  BLOCKS
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};
