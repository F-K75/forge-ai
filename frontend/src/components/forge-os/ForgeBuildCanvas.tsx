import { useState, useMemo, useEffect } from "react";
import {
  Check,
  Loader2,
  Layers,
  Sparkles,
  Code2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Activity,
  Copy,
  Terminal,
  Workflow,
  Network,
  Table as TableIcon,
  CheckCircle2,
  Clock,
  RefreshCw,
  Eye,
  Sliders,
  FileCode2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

export interface CanvasNode {
  id: string;
  label: string;
  category: "foundation" | "shell" | "core" | "infra";
  status: "done" | "building" | "queued";
  description: string;
  agent: string;
  files: string[];
  metrics?: string;
  dependencies: string[];
  dependants: string[];
  tier: number;
  details: {
    specs: string[];
    endpoints?: string[];
    sampleCode?: string;
    diagnostics?: string[];
  };
}

const DEFAULT_NODES: CanvasNode[] = [
  {
    id: "arch",
    label: "Architecture Topology",
    category: "foundation",
    status: "done",
    description: "System contracts, DAG topology, strict Zod schemas & state bounds",
    agent: "Architect",
    files: ["src/types/api.ts", "src/lib/constants.ts"],
    metrics: "Clean DAG · 0 cycles · Strict AST",
    dependencies: [],
    dependants: ["shell", "auth"],
    tier: 0,
    details: {
      specs: [
        "TypeScript 5.4 strict typed contracts",
        "Zod runtime validation schemas for external inputs",
        "Zero circular dependency acyclic graph guarantee",
        "Edge-compatible request router interface (Hono)",
      ],
      endpoints: ["GET /api/health", "GET /api/schema/openapi"],
      sampleCode: `export interface UserSession {\n  userId: string;\n  tenantId: string;\n  role: 'owner' | 'admin' | 'member';\n  expiresAt: number;\n}\n\nexport const SessionSchema = z.object({\n  userId: z.string().uuid(),\n  role: z.enum(['owner', 'admin', 'member'])\n});`,
      diagnostics: [
        "[00:01.12] AST cycle analyzer invoked: 0 dependency cycles found",
        "[00:01.18] Validated 18 type definitions against RFC 7519",
        "[00:01.24] Generated TypeScript export barrel in src/types/index.ts",
      ],
    },
  },
  {
    id: "shell",
    label: "App Shell & UI tokens",
    category: "shell",
    status: "done",
    description: "Responsive layouts, navigation bar, dark theme & semantic design tokens",
    agent: "Designer",
    files: ["src/App.tsx", "src/index.css"],
    metrics: "Tailwind v4 · 60fps · Zero Jank",
    dependencies: ["arch"],
    dependants: ["auth", "billing"],
    tier: 1,
    details: {
      specs: [
        "Precision Architectural Studio semantic surface tokens",
        "Adaptive 12-column grid and mobile viewport bounds",
        "Tactile interaction feedback hooks",
        "Hardware-accelerated CSS transitions (150ms)",
      ],
      sampleCode: `export function AppShell({ children }: { children: React.ReactNode }) {\n  return (\n    <div className="bg-base min-h-screen text-ink font-sans">\n      {children}\n    </div>\n  );\n}`,
      diagnostics: [
        "[00:02.04] Tailwind compiler: 48 utility classes compiled in 14ms",
        "[00:02.10] Verified WCAG 2.1 AA 4.5:1 contrast across light/dark themes",
        "[00:02.15] Mounted responsive navigation frame with 6 surface triggers",
      ],
    },
  },
  {
    id: "auth",
    label: "OAuth & Security",
    category: "core",
    status: "done",
    description: "Google & GitHub OAuth 2.1, PKCE SHA-256 verification & rotating JWTs",
    agent: "Builder",
    files: ["src/api/auth.ts", "src/lib/session.ts"],
    metrics: "PKCE · SHA-256 · HTTP-only",
    dependencies: ["arch", "shell"],
    dependants: ["billing", "db"],
    tier: 2,
    details: {
      specs: [
        "OAuth 2.1 authorization code flow with PKCE code_verifier",
        "Stateless session tokens signed with Ed25519 keys",
        "Strict SameSite=Lax cookie headers preventing CSRF",
        "Automated token refresh middleware with 15-minute rotation",
      ],
      endpoints: ["POST /api/auth/google", "POST /api/auth/refresh", "GET /api/auth/me", "POST /api/auth/logout"],
      sampleCode: `export async function verifyPKCEToken(token: string, verifier: string) {\n  const payload = await jwtVerify(token, GOOGLE_JWKS);\n  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));\n  return { email: payload.email, sub: payload.sub, verified: true };\n}`,
      diagnostics: [
        "[00:03.20] Cryptographic primitives initialized: Ed25519 & SHA-256",
        "[00:03.25] Verified OAuth redirect URI matching cloud run domain",
        "[00:03.32] Security Auditor agent audit: 0 vulnerabilities flagged",
      ],
    },
  },
  {
    id: "billing",
    label: "Billing & Stripe",
    category: "core",
    status: "building",
    description: "Stripe subscription checkout, webhook replay prevention & usage metering",
    agent: "Builder",
    files: ["src/api/checkout.ts", "src/components/Checkout.tsx"],
    metrics: "Stripe v3 · Idempotency keys",
    dependencies: ["auth", "shell"],
    dependants: ["deploy"],
    tier: 2,
    details: {
      specs: [
        "Stripe Elements embedded custom payment container",
        "HMAC-SHA256 webhook signature validation against replay attacks",
        "Automatic database tier synchronization upon checkout completion",
        "Customer portal redirection for billing adjustments",
      ],
      endpoints: ["POST /api/checkout/session", "POST /api/webhooks/stripe", "GET /api/billing/portal"],
      sampleCode: `export async function handleStripeWebhook(event: Stripe.Event) {\n  switch (event.type) {\n    case 'checkout.session.completed':\n      await activateSubscription(event.data.object);\n      break;\n  }\n  return { received: true };\n}`,
      diagnostics: [
        "[00:04.02] Stripe client initialized with API version 2024-06-20",
        "[00:04.14] Replay prevention cache mounted with 300s TTL",
        "[00:04.28] Webhook test fixture verified against mocked Stripe CLI event",
      ],
    },
  },
  {
    id: "db",
    label: "Database & Storage",
    category: "core",
    status: "done",
    description: "PostgreSQL 16 relational schema, connection pooling & transactional rollback",
    agent: "Builder",
    files: ["src/db/schema.sql", "src/db/client.ts"],
    metrics: "PostgreSQL 16 · Pooled · <4ms",
    dependencies: ["auth"],
    dependants: ["deploy"],
    tier: 2,
    details: {
      specs: [
        "Normalized tables for users, organizations, subscriptions, and audit logs",
        "PostgreSQL 16 connection pool (max 20 connections per edge worker)",
        "Zero-downtime forward/backward migration runbook",
        "Row-level security (RLS) policies for multi-tenant isolation",
      ],
      endpoints: ["GET /api/db/health", "POST /api/db/migrate"],
      sampleCode: `CREATE TABLE users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email VARCHAR(255) UNIQUE NOT NULL,\n  role VARCHAR(32) NOT NULL DEFAULT 'member',\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_users_email ON users(email);`,
      diagnostics: [
        "[00:03.45] PostgreSQL connection pool configured: pool_size=20, timeout=5s",
        "[00:03.50] Applied migration 001_initial_schema.sql successfully",
        "[00:03.58] Query planner benchmark: indexed email lookup latency 1.4ms",
      ],
    },
  },
  {
    id: "deploy",
    label: "Edge Cluster Distribution",
    category: "infra",
    status: "building",
    description: "Global edge CDN, automated TLS certificates & zero-downtime blue/green routing",
    agent: "DevOps",
    files: ["wrangler.toml", "deploy.config.ts"],
    metrics: "5 Regions · <18ms latency",
    dependencies: ["billing", "db"],
    dependants: [],
    tier: 3,
    details: {
      specs: [
        "Global edge compute distribution (us-east, us-west, eu-central, ap-east, sa-east)",
        "Automated TLS 1.3 certificate negotiation and HTTPS enforcement",
        "Blue/Green zero-downtime deployment switch with instant rollback",
        "Real-time edge health probes and latency telemetry reporting",
      ],
      endpoints: ["GET /healthz", "GET /metrics/prometheus"],
      sampleCode: `export default {\n  async fetch(request: Request, env: Env) {\n    const url = new URL(request.url);\n    if (url.pathname === '/healthz') return new Response('OK', { status: 200 });\n    return handler(request, env);\n  }\n};`,
      diagnostics: [
        "[00:05.01] Edge cluster status: 5/5 regions synchronized",
        "[00:05.15] TLS 1.3 handshake benchmark: 11ms median latency",
        "[00:05.29] Traffic routed to canary group (10% sample)",
      ],
    },
  },
];

class CanvasAudioSynth {
  private ctx: AudioContext | null = null;

  private getCtx() {
    if (typeof window === "undefined") return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx || this.ctx.state === "suspended") {
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  playPop(freq: number = 880) {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio autoplay policy fallback
    }
  }
}

const synth = new CanvasAudioSynth();

interface ForgeBuildCanvasProps {
  onSelectNodeFile?: (filename: string) => void;
  onOpenPreview?: () => void;
  buildPrompt?: string;
  customNodes?: CanvasNode[];
}

type ViewMode = "dag" | "pipeline" | "matrix";
type CategoryFilter = "all" | "foundation" | "shell" | "core" | "infra";
type InspectorTab = "overview" | "code" | "endpoints" | "diagnostics";

export function ForgeBuildCanvas({
  onSelectNodeFile,
  onOpenPreview,
  buildPrompt = "Build SaaS landing page with Stripe checkout",
  customNodes,
}: ForgeBuildCanvasProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>(customNodes || DEFAULT_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    customNodes && customNodes.length > 0 ? customNodes[0].id : "billing"
  );

  useEffect(() => {
    if (customNodes && customNodes.length > 0) {
      setNodes(customNodes);
      setSelectedNodeId((cur) =>
        customNodes.some((n) => n.id === cur) ? cur : customNodes[0].id
      );
    }
  }, [customNodes]);

  const [viewMode, setViewMode] = useState<ViewMode>("dag");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [simulationActive, setSimulationActive] = useState<boolean>(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("overview");
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [synthesizingNodeId, setSynthesizingNodeId] = useState<string | null>(null);
  const [pulseCount, setPulseCount] = useState<number>(0);

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!simulationActive) return;
    const timer = setInterval(() => {
      setPulseCount((p) => (p + 1) % 100);
    }, 1800);
    return () => clearInterval(timer);
  }, [simulationActive]);

  const filteredNodes = useMemo(() => {
    if (categoryFilter === "all") return nodes;
    return nodes.filter((n) => n.category === categoryFilter);
  }, [nodes, categoryFilter]);

  const verifiedCount = useMemo(() => {
    return nodes.filter((n) => n.status === "done").length;
  }, [nodes]);

  const handleSynthesizeNode = (nodeId: string) => {
    synth.playPop(1200);
    setSynthesizingNodeId(nodeId);
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, status: "building" } : n))
    );

    setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, status: "done" } : n))
      );
      setSynthesizingNodeId(null);
      synth.playPop(1600);
      toast.success(`Node "${nodeId.toUpperCase()}" synthesized & verified`);
    }, 1600);
  };

  const handleCopyCode = (code: string) => {
    synth.playPop(900);
    navigator.clipboard.writeText(code);
    toast.success("Sample code copied to clipboard");
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-base text-ink select-none">
      {/* Canvas Header Bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border bg-panel-alt flex flex-wrap items-center justify-between gap-3 z-10">
        {/* Left: Topology Label, Prompt & View Switcher */}
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-accent shrink-0">
            <Workflow size={14} />
            <span>TOPOLOGY_DAG</span>
          </div>

          <span className="text-xs text-muted truncate max-w-[200px] sm:max-w-xs hidden sm:inline">
            &ldquo;{buildPrompt}&rdquo;
          </span>

          {/* View Mode Segmented Control */}
          <div className="inline-flex items-center p-0.5 rounded-lg border border-border bg-panel">
            {(
              [
                { id: "dag", label: "DAG Graph", icon: Network },
                { id: "pipeline", label: "Pipeline", icon: Layers },
                { id: "matrix", label: "Matrix", icon: TableIcon },
              ] as const
            ).map((mode) => {
              const Icon = mode.icon;
              const active = viewMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    synth.playPop(720);
                    setViewMode(mode.id);
                  }}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                    active
                      ? "bg-accent text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon size={12} />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Category Filters, Verification Summary & Canvas Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="hidden xl:flex items-center gap-1">
            {(["all", "foundation", "shell", "core", "infra"] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  synth.playPop(650);
                  setCategoryFilter(cat);
                }}
                className={`h-7 px-2 rounded-md text-[11px] font-medium capitalize transition-colors duration-150 cursor-pointer ${
                  categoryFilter === cat
                    ? "bg-accent-soft text-accent border border-accent/30"
                    : "text-muted hover:text-ink hover:bg-panel border border-transparent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ok tabular-nums whitespace-nowrap px-1">
            <CheckCircle2 size={13} />
            <span>
              {verifiedCount}/{nodes.length} Verified
            </span>
          </span>

          {/* Simulation Toggle */}
          <button
            type="button"
            onClick={() => {
              synth.playPop(simulatingFreq(simulationActive));
              setSimulationActive((v) => !v);
              toast(simulationActive ? "Simulation paused" : "Simulation stream active");
            }}
            title={simulationActive ? "Pause DAG stream" : "Start DAG stream"}
            className={`h-7 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 cursor-pointer ${
              simulationActive
                ? "bg-accent-soft text-accent border-accent/30"
                : "bg-panel text-muted border-border hover:text-ink"
            }`}
          >
            <Activity size={12} />
            <span className="hidden sm:inline">{simulationActive ? "Live" : "Paused"}</span>
          </button>

          {/* Zoom Controls */}
          <div className="inline-flex items-center rounded-md border border-border bg-panel divide-x divide-border">
            <button
              type="button"
              onClick={() => {
                synth.playPop(550);
                setZoomLevel((z) => Math.max(0.75, +(z - 0.1).toFixed(2)));
              }}
              title="Zoom out"
              aria-label="Zoom out"
              className="h-7 w-7 flex items-center justify-center text-muted hover:text-ink hover:bg-panel-alt transition-colors cursor-pointer"
            >
              <ZoomOut size={12} />
            </button>
            <span className="text-[11px] font-mono tabular-nums px-2 text-ink">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => {
                synth.playPop(650);
                setZoomLevel((z) => Math.min(1.4, +(z + 0.1).toFixed(2)));
              }}
              title="Zoom in"
              aria-label="Zoom in"
              className="h-7 w-7 flex items-center justify-center text-muted hover:text-ink hover:bg-panel-alt transition-colors cursor-pointer"
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                synth.playPop(600);
                setZoomLevel(1);
              }}
              title="Reset zoom"
              aria-label="Reset zoom"
              className="h-7 w-7 flex items-center justify-center text-muted hover:text-ink hover:bg-panel-alt transition-colors cursor-pointer"
            >
              <RotateCcw size={11} />
            </button>
          </div>

          {/* Inspector Toggle */}
          <button
            type="button"
            onClick={() => {
              synth.playPop(850);
              setInspectorOpen((v) => !v);
            }}
            className={`h-7 px-2.5 rounded-md border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 cursor-pointer ${
              inspectorOpen
                ? "bg-accent text-white border-accent"
                : "bg-panel text-ink border-border hover:bg-panel-alt"
            }`}
            title="Toggle node inspector drawer"
          >
            <Sliders size={12} />
            <span className="hidden md:inline">Inspector</span>
          </button>
        </div>
      </div>

      {/* Main Workbench Area */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row relative overflow-hidden">
        {/* VIEW 1: INTERACTIVE DAG GRAPH */}
        {viewMode === "dag" && (
          <div
            className="flex-1 relative overflow-auto p-5 sm:p-8 bg-base"
            style={{
              backgroundImage:
                "radial-gradient(rgb(var(--outline) / 0.55) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          >
            <div
              className="max-w-3xl mx-auto flex flex-col items-center gap-3 py-2 transition-transform origin-top"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {nodes.length >= 6 && categoryFilter === "all" ? (
                <>
                  {/* Tier 0: Foundation */}
                  <div className="w-full flex justify-center">
                    <DAGNodeCard
                      node={nodes[0]}
                      isSelected={selectedNodeId === nodes[0].id}
                      isSynthesizing={synthesizingNodeId === nodes[0].id}
                      onClick={() => {
                        synth.playPop(900);
                        setSelectedNodeId(nodes[0].id);
                      }}
                      onSelectFile={onSelectNodeFile}
                    />
                  </div>

                  <DAGConnectionPipe
                    isFlowing={simulationActive}
                    pulseOffset={pulseCount}
                    isActive={selectedNodeId === nodes[0].id || selectedNodeId === nodes[1].id}
                  />

                  {/* Tier 1: App Shell */}
                  <div className="w-full flex justify-center">
                    <DAGNodeCard
                      node={nodes[1]}
                      isSelected={selectedNodeId === nodes[1].id}
                      isSynthesizing={synthesizingNodeId === nodes[1].id}
                      onClick={() => {
                        synth.playPop(950);
                        setSelectedNodeId(nodes[1].id);
                      }}
                      onSelectFile={onSelectNodeFile}
                    />
                  </div>

                  {/* Branch Split */}
                  <div className="w-full max-w-xl flex flex-col items-center my-0.5">
                    <div
                      className={`w-px h-4 transition-colors ${
                        selectedNodeId === nodes[1].id ? "bg-accent" : "bg-border"
                      }`}
                    />
                    <div
                      className={`w-full h-px transition-colors ${
                        selectedNodeId === nodes[1].id ? "bg-accent" : "bg-border"
                      }`}
                    />
                    <div className="w-full flex justify-between">
                      <div className="w-px h-4 bg-border" />
                      <div className="w-px h-4 bg-border" />
                      <div className="w-px h-4 bg-border" />
                    </div>
                  </div>

                  {/* Tier 2: Core Services */}
                  <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3.5 max-w-3xl">
                    {[nodes[2], nodes[3], nodes[4]].map((node, idx) => (
                      <DAGNodeCard
                        key={node.id}
                        node={node}
                        isSelected={selectedNodeId === node.id}
                        isSynthesizing={synthesizingNodeId === node.id}
                        onClick={() => {
                          synth.playPop(1000 + idx * 50);
                          setSelectedNodeId(node.id);
                        }}
                        onSelectFile={onSelectNodeFile}
                      />
                    ))}
                  </div>

                  {/* Branch Convergence */}
                  <div className="w-full max-w-xl flex flex-col items-center my-0.5">
                    <div className="w-full flex justify-between">
                      <div className="w-px h-4 bg-border" />
                      <div className="w-px h-4 bg-border" />
                      <div className="w-px h-4 bg-border" />
                    </div>
                    <div className="w-full h-px bg-border" />
                    <div className="w-px h-4 bg-border" />
                  </div>

                  {/* Tier 3: Edge Deployment */}
                  <div className="w-full flex justify-center">
                    <DAGNodeCard
                      node={nodes[5]}
                      isSelected={selectedNodeId === nodes[5].id}
                      isSynthesizing={synthesizingNodeId === nodes[5].id}
                      onClick={() => {
                        synth.playPop(1150);
                        setSelectedNodeId(nodes[5].id);
                      }}
                      onSelectFile={onSelectNodeFile}
                    />
                  </div>
                </>
              ) : (
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredNodes.map((node) => (
                    <DAGNodeCard
                      key={node.id}
                      node={node}
                      isSelected={selectedNodeId === node.id}
                      isSynthesizing={synthesizingNodeId === node.id}
                      onClick={() => {
                        synth.playPop(900);
                        setSelectedNodeId(node.id);
                      }}
                      onSelectFile={onSelectNodeFile}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: PIPELINE COLUMNS */}
        {viewMode === "pipeline" && (
          <div className="flex-1 overflow-x-auto p-5 flex gap-4 items-stretch min-w-max bg-base">
            {[
              { title: "Foundation", tier: 0 },
              { title: "App Shell", tier: 1 },
              { title: "Core Services", tier: 2 },
              { title: "Edge Infra", tier: 3 },
            ].map((col) => {
              const colNodes = nodes.filter((n) => n.tier === col.tier);
              return (
                <div
                  key={col.title}
                  className="w-72 rounded-xl border border-border bg-panel flex flex-col overflow-hidden shadow-apple"
                >
                  <div className="px-3.5 py-2.5 border-b border-border bg-panel-alt flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">{col.title}</span>
                    <span className="text-[11px] font-mono text-muted tabular-nums">
                      {colNodes.length} {colNodes.length === 1 ? "node" : "nodes"}
                    </span>
                  </div>

                  <div className="p-3 flex-1 overflow-y-auto space-y-2.5 bg-base/40">
                    {colNodes.map((n) => {
                      const active = selectedNodeId === n.id;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            synth.playPop(900);
                            setSelectedNodeId(n.id);
                          }}
                          className={`w-full text-left p-3 rounded-lg border transition-colors duration-150 cursor-pointer ${
                            active
                              ? "bg-accent-soft border-accent"
                              : "bg-panel border-border hover:bg-panel-alt"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-xs text-ink truncate">{n.label}</span>
                            <span
                              className={`text-[11px] font-mono shrink-0 ${
                                n.status === "done" ? "text-ok" : "text-warn"
                              }`}
                            >
                              {n.status === "done" ? "Ready" : "Building"}
                            </span>
                          </div>
                          <p className="text-xs text-muted line-clamp-2 mb-2.5">
                            {n.description}
                          </p>
                          <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                            <span>{n.agent}</span>
                            <span className="tabular-nums">{n.files.length} files</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 3: ARCHITECTURE DEPENDENCY MATRIX */}
        {viewMode === "matrix" && (
          <div className="flex-1 overflow-auto p-5 bg-base">
            <div className="max-w-5xl mx-auto rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-panel-alt flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink flex items-center gap-2">
                  <TableIcon size={14} className="text-accent" />
                  <span>Directed Acyclic Graph (DAG) Resolution Matrix</span>
                </span>
                <span className="font-mono text-xs text-ok">
                  CYCLE_ANALYSIS: 0 CYCLES
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel-alt/60 border-b border-border text-muted font-medium">
                    <tr>
                      <th className="px-4 py-2.5">Node ID</th>
                      <th className="px-4 py-2.5">Module Name</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Upstream</th>
                      <th className="px-4 py-2.5">Downstream</th>
                      <th className="px-4 py-2.5">Agent</th>
                      <th className="px-4 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {nodes.map((n) => (
                      <tr
                        key={n.id}
                        onClick={() => {
                          synth.playPop(850);
                          setSelectedNodeId(n.id);
                        }}
                        className={`cursor-pointer transition-colors duration-150 ${
                          selectedNodeId === n.id
                            ? "bg-accent-soft/70"
                            : "hover:bg-panel-alt/50"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-semibold text-accent">{n.id}</td>
                        <td className="px-4 py-2.5 font-sans font-medium text-ink">{n.label}</td>
                        <td className="px-4 py-2.5 capitalize text-muted font-sans">{n.category}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {n.dependencies.length > 0 ? n.dependencies.join(", ") : "Root"}
                        </td>
                        <td className="px-4 py-2.5 text-muted">
                          {n.dependants.length > 0 ? n.dependants.join(", ") : "Edge sink"}
                        </td>
                        <td className="px-4 py-2.5 font-sans text-ink">{n.agent}</td>
                        <td className="px-4 py-2.5 text-right font-sans font-medium">
                          {n.status === "done" ? (
                            <span className="text-ok">Verified</span>
                          ) : (
                            <span className="text-warn">Synthesizing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT: NODE INSPECTOR DRAWER */}
        {inspectorOpen && selectedNode && (
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-border bg-panel flex flex-col shrink-0 max-h-[50vh] lg:max-h-full overflow-hidden">
            {/* Inspector Header */}
            <div className="px-4 py-3 border-b border-border bg-panel-alt flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-muted capitalize">{selectedNode.category}</p>
                <h4 className="font-display font-semibold text-sm text-ink truncate">
                  {selectedNode.label}
                </h4>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSynthesizeNode(selectedNode.id)}
                  disabled={synthesizingNodeId === selectedNode.id}
                  title="Re-synthesize node AST"
                  aria-label="Re-synthesize node AST"
                  className="w-7 h-7 rounded-md border border-border bg-panel hover:bg-base text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    size={13}
                    className={synthesizingNodeId === selectedNode.id ? "animate-spin" : ""}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorOpen(false)}
                  title="Close Inspector"
                  aria-label="Close Inspector"
                  className="w-7 h-7 rounded-md border border-transparent hover:border-border hover:bg-panel text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Inspector Navigation Tabs */}
            <div className="flex border-b border-border bg-panel px-2 pt-1 gap-1">
              {(["overview", "code", "endpoints", "diagnostics"] as InspectorTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    synth.playPop(650);
                    setInspectorTab(tab);
                  }}
                  className={`flex-1 py-2 text-center text-xs font-medium capitalize border-b-2 transition-colors cursor-pointer ${
                    inspectorTab === tab
                      ? "border-accent text-accent"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Inspector Body Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {inspectorTab === "overview" && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium text-muted mb-1">Description</div>
                    <p className="text-xs text-ink leading-relaxed">{selectedNode.description}</p>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted mb-2 flex items-center justify-between">
                      <span>Architecture Specs</span>
                      {selectedNode.details.specs.length > 0 && (
                        <span className="font-mono text-[11px] text-ok">100% satisfied</span>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {selectedNode.details.specs.map((spec, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-ink bg-panel-alt px-3 py-2 rounded-lg border border-border"
                        >
                          <Check size={13} className="text-ok shrink-0 mt-0.5" />
                          <span className="leading-snug">{spec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Dependencies & Consumers */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-lg border border-border bg-panel-alt">
                      <span className="text-[11px] font-medium text-muted block mb-1.5">
                        Upstream
                      </span>
                      {selectedNode.dependencies.length > 0 ? (
                        <div className="space-y-1 font-mono">
                          {selectedNode.dependencies.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setSelectedNodeId(d)}
                              className="w-full text-left text-accent hover:underline cursor-pointer"
                            >
                              ← {d}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-faint font-mono">Root node</span>
                      )}
                    </div>

                    <div className="p-3 rounded-lg border border-border bg-panel-alt">
                      <span className="text-[11px] font-medium text-muted block mb-1.5">
                        Downstream
                      </span>
                      {selectedNode.dependants.length > 0 ? (
                        <div className="space-y-1 font-mono">
                          {selectedNode.dependants.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setSelectedNodeId(d)}
                              className="w-full text-left text-ink hover:text-accent hover:underline cursor-pointer"
                            >
                              → {d}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-faint font-mono">Edge sink</span>
                      )}
                    </div>
                  </div>

                  {/* Connected Source Files */}
                  <div>
                    <div className="text-xs font-medium text-muted mb-2">Affected File Assets</div>
                    <div className="space-y-1.5">
                      {selectedNode.files.map((file) => (
                        <button
                          key={file}
                          type="button"
                          onClick={() => {
                            synth.playPop(950);
                            onSelectNodeFile?.(file);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-panel-alt border border-border text-xs font-mono hover:border-accent hover:text-accent transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileCode2 size={13} className="text-accent shrink-0" />
                            <span className="truncate">{file}</span>
                          </div>
                          <span className="text-[11px] text-muted shrink-0">Open →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {inspectorTab === "code" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted truncate">
                      Contract Implementation ({selectedNode.files[0] || "snippet.ts"})
                    </span>
                    {selectedNode.details.sampleCode && (
                      <button
                        type="button"
                        onClick={() => handleCopyCode(selectedNode.details.sampleCode!)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-panel-alt hover:bg-base text-xs text-ink cursor-pointer"
                      >
                        <Copy size={11} />
                        <span>Copy</span>
                      </button>
                    )}
                  </div>

                  {selectedNode.details.sampleCode ? (
                    <div className="bg-[#0B0F19] text-slate-200 border border-border p-3.5 font-mono text-xs rounded-lg overflow-x-auto leading-relaxed">
                      <pre>{selectedNode.details.sampleCode}</pre>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted border border-dashed border-border rounded-lg text-xs">
                      No code sample declared for this node.
                    </div>
                  )}

                  {selectedNode.files[0] && (
                    <button
                      type="button"
                      onClick={() => onSelectNodeFile?.(selectedNode.files[0])}
                      className="w-full h-9 rounded-lg bg-accent hover:bg-ember-glow text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Code2 size={13} />
                      <span>Edit {selectedNode.files[0]} in Code Studio</span>
                    </button>
                  )}
                </div>
              )}

              {inspectorTab === "endpoints" && (
                <div className="space-y-2.5">
                  <div className="text-xs font-medium text-muted">
                    Route Handlers &amp; Edge Sockets
                  </div>
                  {selectedNode.details.endpoints && selectedNode.details.endpoints.length > 0 ? (
                    <div className="space-y-2">
                      {selectedNode.details.endpoints.map((ep, idx) => {
                        const parts = ep.split(" ");
                        const method = parts[0];
                        const path = parts[1] || ep;
                        return (
                          <div
                            key={idx}
                            className="px-3 py-2.5 border border-border rounded-lg bg-panel-alt flex items-center justify-between gap-2 font-mono text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`font-semibold text-[11px] ${
                                  method === "POST" ? "text-accent" : "text-ok"
                                }`}
                              >
                                {method}
                              </span>
                              <span className="truncate text-ink">{path}</span>
                            </div>
                            <span className="text-[11px] text-ok shrink-0">200 OK</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted border border-dashed border-border rounded-lg text-xs">
                      Internal architectural abstraction; no HTTP endpoint exposed.
                    </div>
                  )}
                </div>
              )}

              {inspectorTab === "diagnostics" && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted">
                      AST Synthesis Stream ({selectedNode.agent})
                    </span>
                    <span className="text-ok font-mono text-[11px]">Active</span>
                  </div>

                  <div className="bg-[#0B0F19] text-slate-200 border border-border p-3.5 font-mono text-[11px] rounded-lg overflow-x-auto space-y-2 leading-relaxed">
                    {selectedNode.details.diagnostics && selectedNode.details.diagnostics.length > 0 ? (
                      selectedNode.details.diagnostics.map((log, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Terminal size={12} className="text-slate-500 shrink-0 mt-0.5" />
                          <span className="text-slate-300">{log}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400">Node AST verification idle.</div>
                    )}
                    <div className="text-emerald-400 pt-1">
                      → Verified AST invariants for {selectedNode.id}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Inspector Footer */}
            <div className="p-3 border-t border-border bg-panel-alt flex items-center gap-2">
              {selectedNode.id === "billing" && (
                <button
                  type="button"
                  onClick={() => {
                    synth.playPop(1100);
                    onOpenPreview?.();
                  }}
                  className="flex-1 h-8 rounded-lg border border-border bg-panel hover:bg-base text-ink text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye size={13} />
                  <span>Preview</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSynthesizeNode(selectedNode.id)}
                disabled={synthesizingNodeId === selectedNode.id}
                className="flex-1 h-8 rounded-lg bg-accent hover:bg-ember-glow text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={13} />
                <span>{synthesizingNodeId === selectedNode.id ? "Synthesizing…" : "Re-Synthesize"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface DAGNodeCardProps {
  node: CanvasNode;
  isSelected: boolean;
  isSynthesizing: boolean;
  onClick: () => void;
  onSelectFile?: (file: string) => void;
}

function DAGNodeCard({
  node,
  isSelected,
  isSynthesizing,
  onClick,
  onSelectFile,
}: DAGNodeCardProps) {
  const isDone = node.status === "done";

  return (
    <div
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative w-full max-w-sm rounded-xl border p-3.5 transition-colors duration-150 cursor-pointer select-none shadow-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        isSelected
          ? "bg-panel border-accent ring-1 ring-accent/30"
          : "bg-panel border-border hover:border-accent/50"
      }`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-mono text-muted capitalize">{node.category}</span>

        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {isSynthesizing ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <Loader2 size={11} className="animate-spin" /> Synthesizing
            </span>
          ) : isDone ? (
            <span className="inline-flex items-center gap-1 text-ok">
              <CheckCircle2 size={11} /> Verified
            </span>
          ) : node.status === "queued" ? (
            <span className="inline-flex items-center gap-1 text-muted">
              <Clock size={11} /> Queued
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warn">
              <Clock size={11} /> Active
            </span>
          )}
        </div>
      </div>

      {/* Node Title & Description */}
      <div className="mb-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-ink truncate">
            {node.label}
          </h3>
          <span className="text-[11px] font-mono text-muted shrink-0">{node.agent}</span>
        </div>
        <p className="text-xs text-muted line-clamp-2 mt-1 leading-relaxed">
          {node.description}
        </p>
      </div>

      {/* Metrics & File Links */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border text-[11px] font-mono">
        <span className="text-muted truncate">{node.metrics}</span>

        <div className="flex items-center gap-1 shrink-0">
          {node.files.slice(0, 2).map((f) => (
            <button
              key={f}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                synth.playPop(900);
                onSelectFile?.(f);
              }}
              title={`Open ${f} in Code Studio`}
              className="px-2 py-0.5 rounded-md bg-panel-alt border border-border text-ink hover:border-accent hover:text-accent text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Code2 size={10} />
              <span>{f.split("/").pop()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DAGConnectionPipeProps {
  isFlowing: boolean;
  pulseOffset: number;
  isActive: boolean;
}

function DAGConnectionPipe({ isFlowing, pulseOffset, isActive }: DAGConnectionPipeProps) {
  return (
    <div className="relative flex flex-col items-center my-0.5">
      <div
        className={`w-px h-6 transition-colors ${
          isActive ? "bg-accent" : "bg-border"
        }`}
      />
      {isFlowing && (
        <span
          className="absolute w-1.5 h-1.5 rounded-full bg-accent transition-all duration-700"
          style={{
            top: `${(pulseOffset * 1.5) % 20}px`,
          }}
        />
      )}
    </div>
  );
}

function simulatingFreq(active: boolean) {
  return active ? 400 : 800;
}
