import { MarkerType } from "reactflow";
import type {
  PMInitiative,
  PMEpic,
  PMStory,
  PMTask,
  PMExecution,
} from "../../../lib/types/api";
import type {
  LayerType,
  LayoutMode,
  FocusFilter,
  DensityMode,
  CustomGraphNode,
  CustomGraphEdge,
  GraphDiagnostics,
  GraphNodePayload,
} from "./graphTypes";

export const LAYER_CONFIG: Record<
  LayerType,
  { label: string; color: string; bg: string; borderColor: string; icon: string }
> = {
  initiative: {
    label: "Initiative",
    color: "#7C5CFF",
    bg: "rgba(124, 92, 255, 0.12)",
    borderColor: "#7C5CFF",
    icon: "Rocket",
  },
  epic: {
    label: "Epics",
    color: "#A855F7",
    bg: "rgba(168, 85, 247, 0.12)",
    borderColor: "#A855F7",
    icon: "Zap",
  },
  story: {
    label: "Stories",
    color: "#06B6D4",
    bg: "rgba(6, 182, 212, 0.12)",
    borderColor: "#06B6D4",
    icon: "BookOpen",
  },
  task: {
    label: "Tasks",
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.12)",
    borderColor: "#10B981",
    icon: "CheckSquare",
  },
  agent_execution: {
    label: "Agent Runs",
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.12)",
    borderColor: "#F59E0B",
    icon: "Bot",
  },
  file: {
    label: "Artifacts",
    color: "#8B8B9E",
    bg: "rgba(139, 139, 158, 0.12)",
    borderColor: "#8B8B9E",
    icon: "FileCode",
  },
  commit: {
    label: "Git Commits",
    color: "#71717A",
    bg: "rgba(113, 113, 122, 0.12)",
    borderColor: "#71717A",
    icon: "GitCommit",
  },
};

export const LAYER_ORDER: LayerType[] = [
  "initiative",
  "epic",
  "story",
  "task",
  "agent_execution",
  "file",
  "commit",
];

interface RawApiGraph {
  nodes?: Array<{ id: string; type: string; label: string; data?: Record<string, unknown> }>;
  edges?: Array<{ source: string; target: string; kind?: string }>;
}

export function synthesizeGraph(params: {
  initiative: PMInitiative | null;
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  executions: PMExecution[];
  apiGraph?: RawApiGraph | null;
  activeLayers: Set<LayerType>;
  searchQuery: string;
  focusFilter: FocusFilter;
  layoutMode: LayoutMode;
  density: DensityMode;
  selectedNodeId: string | null;
}): {
  nodes: CustomGraphNode[];
  edges: CustomGraphEdge[];
  diagnostics: GraphDiagnostics;
} {
  const {
    initiative,
    epics = [],
    stories = [],
    tasks = [],
    executions = [],
    apiGraph,
    activeLayers,
    searchQuery,
    focusFilter,
    layoutMode,
    density,
    selectedNodeId,
  } = params;

  if (!initiative) {
    return {
      nodes: [],
      edges: [],
      diagnostics: getEmptyDiagnostics(),
    };
  }

  const rawNodes: GraphNodePayload[] = [];
  const rawEdges: Array<{
    id: string;
    source: string;
    target: string;
    kind: "hierarchy" | "dependency" | "file" | "commit" | "execution";
  }> = [];

  const taskMap = new Map<string, PMTask>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  // Determine blocked tasks
  const blockedTaskIds = new Set<string>();
  tasks.forEach((t) => {
    if (Array.isArray(t.dependencies) && t.dependencies.length > 0) {
      const isBlocked = t.dependencies.some((depId) => {
        const depTask = taskMap.get(depId);
        return depTask && depTask.status !== "done";
      });
      if (isBlocked && t.status !== "done") {
        blockedTaskIds.add(t.id);
      }
    }
  });

  // Layer 0: Initiative
  rawNodes.push({
    id: initiative.id,
    type: "initiative",
    label: initiative.name,
    title: initiative.name,
    description: initiative.vision,
    status: initiative.status,
    priority: "P0",
    quarter: "Current",
    raw: initiative,
  });

  // Layer 1: Epics
  epics.forEach((epic, idx) => {
    const epicQuarter = ["Q1", "Q2", "Q3", "Q4"][idx % 4];
    rawNodes.push({
      id: epic.id,
      type: "epic",
      label: epic.title,
      title: epic.title,
      description: epic.description,
      status: epic.status || "in_progress",
      priority: (epic.priority as any) || (idx === 0 ? "P0" : "P1"),
      duration: epic.estimated_duration || "2 weeks",
      quarter: epicQuarter,
      raw: epic,
    });

    rawEdges.push({
      id: `e-init-${epic.id}`,
      source: initiative.id,
      target: epic.id,
      kind: "hierarchy",
    });

    // Epic dependencies if any
    const epicDeps = (epic as any).dependencies;
    if (Array.isArray(epicDeps)) {
      epicDeps.forEach((depId: string) => {
        rawEdges.push({
          id: `dep-epic-${depId}-${epic.id}`,
          source: depId,
          target: epic.id,
          kind: "dependency",
        });
      });
    }
  });

  // Layer 2: Stories
  stories.forEach((story, idx) => {
    rawNodes.push({
      id: story.id,
      type: "story",
      label: story.title,
      title: story.title,
      description: story.description,
      status: story.status || "todo",
      priority: (story.priority as any) || (idx % 2 === 0 ? "P1" : "P2"),
      points: story.story_points || 3,
      raw: story,
    });

    if (story.epic_id) {
      rawEdges.push({
        id: `e-epic-${story.epic_id}-${story.id}`,
        source: story.epic_id,
        target: story.id,
        kind: "hierarchy",
      });
    }

    const storyDeps = (story as any).dependencies;
    if (Array.isArray(storyDeps)) {
      storyDeps.forEach((depId: string) => {
        rawEdges.push({
          id: `dep-story-${depId}-${story.id}`,
          source: depId,
          target: story.id,
          kind: "dependency",
        });
      });
    }
  });

  // Layer 3: Tasks
  tasks.forEach((task, idx) => {
    const isBlocked = blockedTaskIds.has(task.id);
    rawNodes.push({
      id: task.id,
      type: "task",
      label: task.title,
      title: task.title,
      description: task.description,
      status: task.status || "todo",
      priority: (task.priority as any) || (idx === 0 ? "P0" : "P1"),
      points: (task as any).story_points || 2,
      duration: task.estimated_hours ? `${task.estimated_hours}h` : "4h",
      assignee: task.assigned_agent || (task as any).assignee || "AI Core",
      dependencies: task.dependencies || [],
      blocked: isBlocked,
      raw: task,
    });

    if (task.story_id) {
      rawEdges.push({
        id: `e-story-${task.story_id}-${task.id}`,
        source: task.story_id,
        target: task.id,
        kind: "hierarchy",
      });
    }

    // Task dependencies (inter-task execution constraints)
    if (Array.isArray(task.dependencies)) {
      task.dependencies.forEach((depId) => {
        rawEdges.push({
          id: `dep-task-${depId}-${task.id}`,
          source: depId,
          target: task.id,
          kind: "dependency",
        });
      });
    }

    // Generated files / artifacts
    if (Array.isArray(task.generated_files)) {
      task.generated_files.slice(0, 3).forEach((filepath, fileIdx) => {
        const fileNodeId = `file-${task.id}-${fileIdx}`;
        rawNodes.push({
          id: fileNodeId,
          type: "file",
          label: filepath.split("/").pop() || filepath,
          title: filepath,
          description: `Generated output by task ${task.title}`,
          status: "generated",
        });
        rawEdges.push({
          id: `e-file-${task.id}-${fileNodeId}`,
          source: task.id,
          target: fileNodeId,
          kind: "file",
        });
      });
    }

    // GitHub Commits
    const ghCommits = (task as any).github?.commit_shas || [];
    if (Array.isArray(ghCommits)) {
      ghCommits.slice(0, 2).forEach((sha: string, cIdx: number) => {
        const commitNodeId = `commit-${task.id}-${cIdx}`;
        rawNodes.push({
          id: commitNodeId,
          type: "commit",
          label: sha.slice(0, 7),
          title: `Commit ${sha.slice(0, 7)}`,
          description: `Git commit for task ${task.title}`,
          status: "committed",
        });
        rawEdges.push({
          id: `e-commit-${task.id}-${commitNodeId}`,
          source: task.id,
          target: commitNodeId,
          kind: "commit",
        });
      });
    }
  });

  // Layer 4: Agent Executions
  executions.forEach((exec) => {
    rawNodes.push({
      id: exec.id,
      type: "agent_execution",
      label: `${exec.agent}: ${(exec.status || "ready").toUpperCase()}`,
      title: `Agent: ${exec.agent}`,
      description: `Targeting task ${exec.task_id || "global"}`,
      status: exec.status || "ready",
      agent: exec.agent,
      raw: exec,
    });

    if (exec.task_id) {
      rawEdges.push({
        id: `e-exec-${exec.task_id}-${exec.id}`,
        source: exec.task_id,
        target: exec.id,
        kind: "execution",
      });
    }
  });

  // If apiGraph provided additional nodes or edges that aren't already represented, merge them
  if (apiGraph && Array.isArray(apiGraph.nodes)) {
    const existingNodeIds = new Set(rawNodes.map((n) => n.id));
    apiGraph.nodes.forEach((n) => {
      const normalizedId = n.id.replace(/^(initiative|epic|story|task|file|commit):/, "");
      if (!existingNodeIds.has(n.id) && !existingNodeIds.has(normalizedId)) {
        const layerType = (n.type as LayerType) || "task";
        rawNodes.push({
          id: n.id,
          type: layerType,
          label: n.label || n.id,
          title: n.label || n.id,
          status: "synced",
        });
        existingNodeIds.add(n.id);
      }
    });

    if (Array.isArray(apiGraph.edges)) {
      const existingEdgeKeys = new Set(rawEdges.map((e) => `${e.source}->${e.target}`));
      apiGraph.edges.forEach((e, idx) => {
        const key = `${e.source}->${e.target}`;
        if (!existingEdgeKeys.has(key)) {
          rawEdges.push({
            id: `api-edge-${idx}`,
            source: e.source,
            target: e.target,
            kind: (e.kind as any) || "hierarchy",
          });
          existingEdgeKeys.add(key);
        }
      });
    }
  }

  // Calculate Diagnostics (Cycles, Critical Path, Bottlenecks)
  const diagnostics = computeDiagnostics(rawNodes, rawEdges);

  // Mark Critical Path on nodes
  const criticalPathSet = new Set(diagnostics.criticalPathNodes);
  rawNodes.forEach((n) => {
    n.isCriticalPath = criticalPathSet.has(n.id);
  });

  // Filter by Active Layers
  let filteredNodes = rawNodes.filter((n) => activeLayers.has(n.type));

  // Filter by Search Query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredNodes = filteredNodes.filter(
      (n) =>
        n.label.toLowerCase().includes(query) ||
        (n.description && n.description.toLowerCase().includes(query)) ||
        (n.priority && n.priority.toLowerCase().includes(query)) ||
        (n.status && n.status.toLowerCase().includes(query)) ||
        (n.assignee && n.assignee.toLowerCase().includes(query))
    );
  }

  // Filter by Focus Mode
  if (focusFilter === "critical_path") {
    filteredNodes = filteredNodes.filter((n) => criticalPathSet.has(n.id) || n.type === "initiative");
  } else if (focusFilter === "blocked") {
    const blockedAndDependents = new Set<string>();
    filteredNodes.forEach((n) => {
      if (n.blocked || (n.dependencies && n.dependencies.length > 0)) {
        blockedAndDependents.add(n.id);
      }
    });
    filteredNodes = filteredNodes.filter((n) => blockedAndDependents.has(n.id) || n.type === "initiative");
  } else if (focusFilter === "in_progress") {
    filteredNodes = filteredNodes.filter(
      (n) => n.status === "in_progress" || n.status === "running" || n.type === "initiative"
    );
  }

  const visibleNodeIdSet = new Set(filteredNodes.map((n) => n.id));

  // Filter visible edges (both source and target must be visible)
  const filteredEdges = rawEdges.filter(
    (e) => visibleNodeIdSet.has(e.source) && visibleNodeIdSet.has(e.target)
  );

  // Lineage calculation for selection highlighting
  let highlightedNodeIds = new Set<string>();
  let highlightedEdgeIds = new Set<string>();

  if (selectedNodeId && visibleNodeIdSet.has(selectedNodeId)) {
    const { nodes: relatedNodes, edges: relatedEdges } = getLineage(
      selectedNodeId,
      rawNodes,
      rawEdges
    );
    highlightedNodeIds = relatedNodes;
    highlightedEdgeIds = relatedEdges;
  }

  // Apply layout positions
  const positionedNodes = computeLayoutPositions(
    filteredNodes,
    layoutMode,
    density,
    selectedNodeId,
    highlightedNodeIds
  );

  // Construct ReactFlow Edges
  const finalEdges: CustomGraphEdge[] = filteredEdges.map((e) => {
    const isDependency = e.kind === "dependency";
    const isCritical = criticalPathSet.has(e.source) && criticalPathSet.has(e.target);
    const isHighlighted = highlightedEdgeIds.has(e.id);
    const isDimmed = selectedNodeId ? !isHighlighted : false;

    let strokeColor = "#3B3B4F";
    let strokeWidth = 1.5;
    let animated = false;

    if (isCritical) {
      strokeColor = "#EC4899"; // High-visibility Magenta for critical path
      strokeWidth = 2.5;
      animated = true;
    } else if (isDependency) {
      strokeColor = "#F59E0B"; // Amber for execution dependency constraints
      strokeWidth = 2;
      animated = true;
    } else if (e.kind === "execution") {
      strokeColor = "#A855F7";
    } else if (e.kind === "file") {
      strokeColor = "#64748B";
    }

    if (isHighlighted) {
      strokeColor = "#38BDF8";
      strokeWidth = 3;
      animated = true;
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      animated,
      data: {
        kind: e.kind,
        isCriticalPath: isCritical,
        isHighlighted,
        isDimmed,
      },
      style: {
        stroke: strokeColor,
        strokeWidth,
        opacity: isDimmed ? 0.2 : 1,
        strokeDasharray: isDependency ? "5,5" : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 14,
        height: 14,
      },
    };
  });

  return {
    nodes: positionedNodes,
    edges: finalEdges,
    diagnostics,
  };
}

/**
 * Computes layout positions according to layoutMode (horizontal, vertical, radial)
 */
function computeLayoutPositions(
  nodes: GraphNodePayload[],
  layoutMode: LayoutMode,
  density: DensityMode,
  selectedNodeId: string | null,
  highlightedNodeIds: Set<string>
): CustomGraphNode[] {
  const nodeWidth = density === "compact" ? 180 : 250;
  const nodeHeight = density === "compact" ? 64 : 112;

  // Group nodes by layer
  const byLayer: Record<LayerType, GraphNodePayload[]> = {
    initiative: [],
    epic: [],
    story: [],
    task: [],
    agent_execution: [],
    file: [],
    commit: [],
  };

  nodes.forEach((n) => {
    if (byLayer[n.type]) {
      byLayer[n.type].push(n);
    } else {
      byLayer.task.push(n);
    }
  });

  const flowNodes: CustomGraphNode[] = [];

  if (layoutMode === "horizontal") {
    const LAYER_GAP_X = density === "compact" ? 240 : 340;
    const NODE_GAP_Y = density === "compact" ? 84 : 140;

    LAYER_ORDER.forEach((layer, layerIdx) => {
      const layerNodes = byLayer[layer];
      const totalInLayer = layerNodes.length;
      const layerStartY = Math.max(0, (600 - totalInLayer * NODE_GAP_Y) / 2);

      layerNodes.forEach((n, idx) => {
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = highlightedNodeIds.has(n.id);
        const isDimmed = selectedNodeId ? !isSelected && !isHighlighted : false;

        flowNodes.push({
          id: n.id,
          type: n.type,
          position: {
            x: layerIdx * LAYER_GAP_X + 60,
            y: layerStartY + idx * NODE_GAP_Y + 40,
          },
          data: {
            ...n,
            layoutMode,
            density,
            isHighlighted,
            isDimmed,
          },
        });
      });
    });
  } else if (layoutMode === "vertical") {
    const LAYER_GAP_Y = density === "compact" ? 130 : 210;
    const NODE_GAP_X = density === "compact" ? 210 : 280;

    LAYER_ORDER.forEach((layer, layerIdx) => {
      const layerNodes = byLayer[layer];
      const totalInLayer = layerNodes.length;
      const layerStartX = Math.max(0, (900 - totalInLayer * NODE_GAP_X) / 2);

      layerNodes.forEach((n, idx) => {
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = highlightedNodeIds.has(n.id);
        const isDimmed = selectedNodeId ? !isSelected && !isHighlighted : false;

        flowNodes.push({
          id: n.id,
          type: n.type,
          position: {
            x: layerStartX + idx * NODE_GAP_X + 40,
            y: layerIdx * LAYER_GAP_Y + 40,
          },
          data: {
            ...n,
            layoutMode,
            density,
            isHighlighted,
            isDimmed,
          },
        });
      });
    });
  } else {
    // Radial Layout: Concentric circles around Initiative (center)
    const centerX = 600;
    const centerY = 450;
    const layerRadiusMap: Record<LayerType, number> = {
      initiative: 0,
      epic: 180,
      story: 340,
      task: 490,
      agent_execution: 640,
      file: 760,
      commit: 860,
    };

    LAYER_ORDER.forEach((layer) => {
      const layerNodes = byLayer[layer];
      const radius = layerRadiusMap[layer];
      const count = layerNodes.length;

      layerNodes.forEach((n, idx) => {
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = highlightedNodeIds.has(n.id);
        const isDimmed = selectedNodeId ? !isSelected && !isHighlighted : false;

        let x = centerX;
        let y = centerY;

        if (radius > 0 && count > 0) {
          const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
          x = centerX + radius * Math.cos(angle);
          y = centerY + radius * Math.sin(angle);
        }

        flowNodes.push({
          id: n.id,
          type: n.type,
          position: { x: x - nodeWidth / 2, y: y - nodeHeight / 2 },
          data: {
            ...n,
            layoutMode,
            density,
            isHighlighted,
            isDimmed,
          },
        });
      });
    });
  }

  return flowNodes;
}

/**
 * Computes upstream & downstream lineage for a given node ID
 */
export function getLineage(
  targetId: string,
  nodes: GraphNodePayload[],
  edges: Array<{ id: string; source: string; target: string }>
): { nodes: Set<string>; edges: Set<string> } {
  const nodeSet = new Set<string>([targetId]);
  const edgeSet = new Set<string>();

  // Upstream: ancestors (traverse backwards from target via edges where target === e.target)
  const upstreamQueue: string[] = [targetId];
  const visitedUpstream = new Set<string>([targetId]);

  while (upstreamQueue.length > 0) {
    const current = upstreamQueue.shift()!;
    edges.forEach((e) => {
      if (e.target === current && !visitedUpstream.has(e.source)) {
        visitedUpstream.add(e.source);
        nodeSet.add(e.source);
        edgeSet.add(e.id);
        upstreamQueue.push(e.source);
      }
    });
  }

  // Downstream: descendants (traverse forwards via edges where source === e.source)
  const downstreamQueue: string[] = [targetId];
  const visitedDownstream = new Set<string>([targetId]);

  while (downstreamQueue.length > 0) {
    const current = downstreamQueue.shift()!;
    edges.forEach((e) => {
      if (e.source === current && !visitedDownstream.has(e.target)) {
        visitedDownstream.add(e.target);
        nodeSet.add(e.target);
        edgeSet.add(e.id);
        downstreamQueue.push(e.target);
      }
    });
  }

  return { nodes: nodeSet, edges: edgeSet };
}

/**
 * Calculates graph health diagnostics: cycles, critical path, fan-out bottlenecks
 */
function computeDiagnostics(
  nodes: GraphNodePayload[],
  edges: Array<{ id: string; source: string; target: string; kind: string }>
): GraphDiagnostics {
  const layerCounts: Record<LayerType, number> = {
    initiative: 0,
    epic: 0,
    story: 0,
    task: 0,
    agent_execution: 0,
    file: 0,
    commit: 0,
  };

  nodes.forEach((n) => {
    if (layerCounts[n.type] !== undefined) {
      layerCounts[n.type]++;
    }
  });

  // Cycle detection via DFS on dependency edges
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  nodes.forEach((n) => {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
  });

  let dependencyEdgesCount = 0;
  edges.forEach((e) => {
    if (e.kind === "dependency") dependencyEdgesCount++;
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  // DFS Cycle check
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycleNodes: string[] = [];

  function hasCycleDFS(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycleDFS(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        cycleNodes.push(neighbor, nodeId);
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  let hasCycles = false;
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      if (hasCycleDFS(n.id)) {
        hasCycles = true;
        break;
      }
    }
  }

  // Critical Path calculation: longest path from source to sink
  const memoPath = new Map<string, string[]>();

  function getLongestPath(nodeId: string): string[] {
    if (memoPath.has(nodeId)) return memoPath.get(nodeId)!;

    const neighbors = adj.get(nodeId) || [];
    if (neighbors.length === 0) {
      const res = [nodeId];
      memoPath.set(nodeId, res);
      return res;
    }

    let bestSubPath: string[] = [];
    for (const neighbor of neighbors) {
      const sub = getLongestPath(neighbor);
      if (sub.length > bestSubPath.length) {
        bestSubPath = sub;
      }
    }

    const res = [nodeId, ...bestSubPath];
    memoPath.set(nodeId, res);
    return res;
  }

  let criticalPathNodes: string[] = [];
  for (const n of nodes) {
    const path = getLongestPath(n.id);
    if (path.length > criticalPathNodes.length) {
      criticalPathNodes = path;
    }
  }

  // Bottleneck nodes: highest fan-out (most dependents waiting on it)
  const bottlenecks = nodes
    .filter((n) => n.type === "epic" || n.type === "story" || n.type === "task")
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      type: n.type,
      dependentsCount: outDegree.get(n.id) || 0,
    }))
    .filter((b) => b.dependentsCount > 1)
    .sort((a, b) => b.dependentsCount - a.dependentsCount)
    .slice(0, 5);

  // Blocked tasks count
  const blockedTasksCount = nodes.filter((n) => n.type === "task" && n.blocked).length;

  // Orphan nodes (in-degree 0 and out-degree 0, excluding initiative)
  const orphanNodesCount = nodes.filter(
    (n) => n.type !== "initiative" && (inDegree.get(n.id) || 0) === 0 && (outDegree.get(n.id) || 0) === 0
  ).length;

  // Parallelism index: max number of tasks with identical depth or concurrent execution branches
  const parallelismIndex = Math.max(1, Math.min(12, Math.floor(nodes.length / Math.max(1, criticalPathNodes.length))));

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    dependencyEdges: dependencyEdgesCount,
    layerCounts,
    hasCycles,
    cycleNodes,
    blockedTasksCount,
    criticalPathLength: criticalPathNodes.length,
    criticalPathNodes,
    bottlenecks,
    orphanNodesCount,
    parallelismIndex,
  };
}

function getEmptyDiagnostics(): GraphDiagnostics {
  return {
    totalNodes: 0,
    totalEdges: 0,
    dependencyEdges: 0,
    layerCounts: {
      initiative: 0,
      epic: 0,
      story: 0,
      task: 0,
      agent_execution: 0,
      file: 0,
      commit: 0,
    },
    hasCycles: false,
    cycleNodes: [],
    blockedTasksCount: 0,
    criticalPathLength: 0,
    criticalPathNodes: [],
    bottlenecks: [],
    orphanNodesCount: 0,
    parallelismIndex: 0,
  };
}
