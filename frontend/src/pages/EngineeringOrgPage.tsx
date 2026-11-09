import { useEffect, useMemo, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Send } from "lucide-react"
import ReactFlow, { Background, Controls, type Node, type Edge, MarkerType, useNodesState, useEdgesState } from "reactflow"
import "reactflow/dist/style.css"
import { motion, useReducedMotion } from "motion/react"
import BrandLogo from "../components/BrandLogo"
import { motionVariants } from "../lib/animations"
import { agentOrgApi, type AgentProfile, type RouteAssignment } from "../lib/api"
import { LIVE_MODE } from "../lib/env"

const LEVEL_COLOR: Record<string, string> = {
  junior: "#8B8B9E",
  mid: "#34D399",
  senior: "#22D3EE",
  lead: "#A855F7",
  principal: "#E8823C",
}

const STATUS_COLOR: Record<string, string> = {
  active: "#34D399",
  idle: "#F59E0B",
  retired: "#5A5A6B",
}

const GRAPH_TYPE_ORDER = ["agent", "build", "file", "decision"]
const GRAPH_TYPE_COLOR: Record<string, string> = {
  agent: "#E8823C",
  build: "#22D3EE",
  file: "#8B8B9E",
  decision: "#A855F7",
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: `${LEVEL_COLOR[level] ?? "#8B8B9E"}1A`, color: LEVEL_COLOR[level] ?? "#8B8B9E" }}
    >
      {level}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: STATUS_COLOR[status] ?? "#5A5A6B" }}
      title={status}
    />
  )
}

function AgentCard({ agent }: { agent: AgentProfile }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-base">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot status={agent.status} />
          <span className="text-sm text-ink truncate">{agent.display_name}</span>
        </div>
        <LevelBadge level={agent.level} />
      </div>
      <p className="text-xs text-faint mb-2">{agent.role}</p>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>{agent.stats.tasks_completed} tasks</span>
        <span>{Math.round(agent.stats.success_rate * 100)}% success</span>
        <span>{agent.owned_paths.length} files</span>
      </div>
    </div>
  )
}

function OrgChart({ departments, agentsById }: { departments: { key: string; name: string; agent_ids: string[] }[]; agentsById: Record<string, AgentProfile> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {departments.map((dept) => (
        <div key={dept.key} className="border border-border rounded-lg p-4">
          <h3 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">{dept.name}</h3>
          <div className="space-y-2">
            {dept.agent_ids.map((id) => {
              const agent = agentsById[id]
              return agent ? <AgentCard key={id} agent={agent} /> : null
            })}
             {dept.agent_ids.length === 0 && <p className="text-xs text-faint">No agents assigned yet</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskRouterPanel({ projectId }: { projectId: string }) {
  const [request, setRequest] = useState("")
  const [assignments, setAssignments] = useState<RouteAssignment[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRoute() {
    if (!request.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await agentOrgApi.route(projectId, request)
      setAssignments(res.assignments)
    } catch {
      setError("Unable to route this request. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">Route a request</h2>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRoute()}
          placeholder='For example, "Improve dashboard performance"'
          className="flex-1 bg-base border border-border rounded-md px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleRoute}
          disabled={loading || !request.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm bg-accent text-base disabled:opacity-40"
        >
          <Send size={14} aria-hidden="true" />
          Route
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {assignments && (
        <ul className="space-y-1.5">
          {assignments.map((a) => (
            <li key={a.agent_id} className="flex items-center justify-between text-sm">
              <span className="text-ink">{a.display_name}</span>
              <span className="text-xs text-faint">{a.department} / {a.role}</span>
            </li>
          ))}
          {assignments.length === 0 && <p className="text-xs text-faint">No assignments yet</p>}
        </ul>
      )}
    </div>
  )
}

function OwnershipTable({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-org-ownership", projectId],
    queryFn: () => agentOrgApi.ownershipSummary(projectId),
    enabled: LIVE_MODE,
  })

  const rows = data?.summary ?? []

  return (
    <div className="border border-border rounded-lg p-4">
      <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">Code ownership</h2>
       {isLoading && <p className="text-sm text-faint">Loading</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-faint">No files owned yet. Ownership grows as agents complete work.</p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.agent_id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink">{r.display_name}</span>
                <span className="text-xs text-faint">{r.file_count} files</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(r.top_level_breakdown).map(([dir, count]) => (
                  <span key={dir} className="text-[10px] px-1.5 py-0.5 rounded bg-border text-muted">
                    {dir} ({count})
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KnowledgeGraphPanel({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ["agent-org-graph", projectId],
    queryFn: () => agentOrgApi.graph(projectId),
    enabled: LIVE_MODE,
  })

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!data) return { nodes: [], edges: [] }

    const byType: Record<string, typeof data.nodes> = {}
    for (const n of data.nodes) {
      byType[n.type] = byType[n.type] ?? []
      byType[n.type].push(n)
    }

    const nodes: Node[] = []
    GRAPH_TYPE_ORDER.forEach((type, layerIndex) => {
      ;(byType[type] ?? []).forEach((n, i) => {
        nodes.push({
          id: n.id,
          data: { label: n.label },
          position: { x: layerIndex * 260, y: i * 56 },
          style: {
            background: "#13131B",
            border: `1px solid ${GRAPH_TYPE_COLOR[type] ?? "#22222E"}`,
            color: "#E8E8F0",
            fontSize: 11,
            borderRadius: 6,
            padding: "6px 10px",
            width: 200,
          },
        })
      })
    })

    const edges: Edge[] = data.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      style: { stroke: "#22222E" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#5A5A6B" },
    }))

    return { nodes, edges }
  }, [data])

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(edges)

  // useNodesState/useEdgesState only consume their argument as the initial
  // value on mount -- the graph query resolves after that first render, so
  // without this the canvas stays permanently empty once data arrives.
  useEffect(() => {
    setFlowNodes(nodes)
    setFlowEdges(edges)
  }, [nodes, edges, setFlowNodes, setFlowEdges])

  if (!data) {
    return <div className="flex h-[360px] items-center justify-center text-sm text-faint">Loading graph</div>
  }
    if (data.nodes.length === 0) {
     return <div className="flex h-[360px] items-center justify-center text-sm text-faint">Nothing to show yet — start building to populate the graph.</div>
   }

  return (
    <div className="h-[360px] w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#22222E" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export default function EngineeringOrgPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const reduceMotion = useReducedMotion()

  const { data, isLoading } = useQuery({
    queryKey: ["agent-org", projectId],
    queryFn: () => agentOrgApi.getOrg(projectId!),
    enabled: LIVE_MODE && Boolean(projectId),
  })

  const agentsById = useMemo(() => {
    const map: Record<string, AgentProfile> = {}
    for (const a of data?.agents ?? []) map[a.id] = a
    return map
  }, [data])

  if (!projectId) return null

  return (
    <motion.div
      className="px-6 md:px-10 py-10 md:py-14 max-w-7xl mx-auto"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
        <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
        <Link to={`/project/${projectId}`} className="hover:text-ink">Project</Link>
      </div>
      <header className="flex items-center gap-3 mb-10">
        <BrandLogo size="md" />
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">
          Engineering organization
        </h1>
      </header>

      {!LIVE_MODE && (
        <div className="mb-9 bg-warn/10 border border-warn/30 text-warn px-4 py-3 rounded-lg text-sm">
          Demo mode — connect a backend to view live project data.
        </div>
      )}

      {LIVE_MODE && isLoading && <p className="text-sm text-muted">Loading</p>}

      {LIVE_MODE && data && (
        <>
          <section aria-label="Org chart" className="mb-9">
            <motion.div variants={reduceMotion ? undefined : motionVariants.staggerContainer} initial={reduceMotion ? false : "hidden"} animate="visible">
              <OrgChart departments={data.org.departments} agentsById={agentsById} />
            </motion.div>
          </section>

          <div className="flex flex-col lg:flex-row gap-5 mb-9">
            <div className="lg:w-1/2">
              <TaskRouterPanel projectId={projectId} />
            </div>
            <div className="lg:w-1/2">
              <OwnershipTable projectId={projectId} />
            </div>
          </div>

          <section aria-label="Knowledge graph" className="border border-border rounded-lg p-4 mb-9">
            <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">Knowledge graph</h2>
            <KnowledgeGraphPanel projectId={projectId} />
          </section>
        </>
      )}
    </motion.div>
  )
}
