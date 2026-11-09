import type { Node, Edge } from "reactflow";
import type { PMInitiative, PMTask, PMEpic, PMStory, PMExecution } from "../../../lib/types/api";

export type LayerType =
  | "initiative"
  | "epic"
  | "story"
  | "task"
  | "agent_execution"
  | "file"
  | "commit";

export type LayoutMode = "horizontal" | "vertical" | "radial";

export type FocusFilter = "all" | "critical_path" | "blocked" | "in_progress";

export type DensityMode = "compact" | "detailed";

export interface GraphNodePayload {
  id: string;
  type: LayerType;
  label: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: "P0" | "P1" | "P2" | "P3";
  points?: number;
  duration?: string;
  assignee?: string;
  agent?: string;
  quarter?: string;
  dependencies?: string[];
  blocked?: boolean;
  isCriticalPath?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  layoutMode?: LayoutMode;
  density?: DensityMode;
  raw?: PMInitiative | PMTask | PMEpic | PMStory | PMExecution | Record<string, unknown> | any;
}

export type CustomGraphNode = Node<GraphNodePayload>;
export type CustomGraphEdge = Edge<{
  kind?: "hierarchy" | "dependency" | "file" | "commit" | "execution";
  isCriticalPath?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
}>;

export interface GraphDiagnostics {
  totalNodes: number;
  totalEdges: number;
  dependencyEdges: number;
  layerCounts: Record<LayerType, number>;
  hasCycles: boolean;
  cycleNodes: string[];
  blockedTasksCount: number;
  criticalPathLength: number;
  criticalPathNodes: string[];
  bottlenecks: Array<{
    nodeId: string;
    label: string;
    type: LayerType;
    dependentsCount: number;
  }>;
  orphanNodesCount: number;
  parallelismIndex: number;
}
