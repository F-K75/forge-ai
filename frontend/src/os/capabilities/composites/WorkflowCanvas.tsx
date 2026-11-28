import { useCallback, useMemo, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow"
import "reactflow/dist/style.css"
import { Plus, Save } from "lucide-react"
import type { CompositeComponentProps, JsonObject } from "../../contracts"
import { Button } from "../../../components/ui/Button"

/** Mirrors the workflow.design graph in capabilities.json (a kernel plan template on save). */
export interface WorkflowNode {
  id: string
  title: string
  /** WS-C's no-key workflow template labels nodes with `label`; used when `title` is absent. */
  label?: string
  role?: string
  department?: string
  description?: string
  position?: { x: number; y: number }
}
export interface WorkflowEdge {
  id?: string
  source: string
  target: string
}

export interface WorkflowCanvasProps {
  nodes?: unknown
  edges?: unknown
  editable?: boolean
  save?: unknown
  [key: string]: unknown
}

const MAX_NODES = 16

function toFlowNodes(raw: unknown): Node[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n): n is WorkflowNode => Boolean(n) && typeof (n as WorkflowNode).id === "string")
    .slice(0, MAX_NODES)
    .map((n, i) => ({
      id: n.id,
      position: n.position ?? { x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 140 },
      data: { label: n.title || n.label || n.id, role: n.role, department: n.department, description: n.description },
    }))
}

function toFlowEdges(raw: unknown): Edge[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is WorkflowEdge => Boolean(e) && typeof (e as WorkflowEdge).source === "string" && typeof (e as WorkflowEdge).target === "string")
    .map((e) => ({ id: e.id ?? `${e.source}->${e.target}`, source: e.source, target: e.target }))
}

export function toWorkflowGraph(nodes: Node[], edges: Edge[]): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  return {
    nodes: nodes.map((n) => {
      const data = (n.data ?? {}) as { label?: string; role?: string; department?: string; description?: string }
      const out: WorkflowNode = { id: n.id, title: String(data.label ?? n.id).slice(0, 200), position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }
      if (data.role) out.role = data.role
      if (data.department) out.department = data.department
      if (data.description) out.description = data.description
      return out
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

export function WorkflowCanvasView({
  nodes: rawNodes,
  edges: rawEdges,
  editable = true,
  onSave,
}: {
  nodes?: unknown
  edges?: unknown
  editable?: boolean
  onSave?: (graph: JsonObject) => void
}) {
  const [nodes, setNodes] = useState<Node[]>(() => toFlowNodes(rawNodes))
  const [edges, setEdges] = useState<Edge[]>(() => toFlowEdges(rawEdges))
  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((ns) => applyNodeChanges(c, ns)), [])
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((es) => applyEdgeChanges(c, es)), [])
  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => (c.source && c.target && c.source !== c.target ? addEdge(c, es) : es)),
    []
  )
  const addStep = () =>
    setNodes((ns) => {
      if (ns.length >= MAX_NODES) return ns
      let n = ns.length + 1
      while (ns.some((x) => x.id === `step_${n}`)) n += 1
      return [...ns, { id: `step_${n}`, position: { x: 40 + (ns.length % 4) * 220, y: 40 + Math.floor(ns.length / 4) * 140 }, data: { label: `Step ${n}` } }]
    })
  const graph = useMemo(() => toWorkflowGraph(nodes, edges), [nodes, edges])
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2" data-testid="os-workflow-canvas">
      {editable || onSave ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {nodes.length} step{nodes.length === 1 ? "" : "s"} · {edges.length} connection{edges.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {editable ? (
              <Button variant="secondary" size="sm" onClick={addStep} disabled={nodes.length >= MAX_NODES}>
                <Plus size={14} aria-hidden="true" /> Add step
              </Button>
            ) : null}
            {onSave ? (
              <Button size="sm" onClick={() => onSave(graph as unknown as JsonObject)} disabled={!nodes.length}>
                <Save size={14} aria-hidden="true" /> Save workflow
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-panel" role="region" aria-label="Workflow canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={editable ? onNodesChange : undefined}
          onEdgesChange={editable ? onEdgesChange : undefined}
          onConnect={editable ? onConnect : undefined}
          nodesDraggable={editable}
          nodesConnectable={editable}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

/**
 * Node canvas for workflow.design. "Save workflow" dispatches the surface's
 * `save` action with `{nodes, edges}`; the server turns it into a kernel plan
 * template (backend/core/os_capabilities/workflow.py).
 */
export default function WorkflowCanvas({ props, dispatch }: CompositeComponentProps<WorkflowCanvasProps>) {
  return (
    <WorkflowCanvasView
      nodes={props.nodes}
      edges={props.edges}
      editable={props.editable !== false}
      onSave={props.save ? (graph) => dispatch("save", graph) : undefined}
    />
  )
}
