import { useState, useMemo, useEffect, useRef } from "react";
import {
  Check,
  Loader2,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Database,
  Globe,
  Layers,
  Cpu,
  Sparkles,
  ExternalLink,
  Code2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Activity,
  Play,
  Pause,
  Copy,
  Terminal,
  Workflow,
  Network,
  Table as TableIcon,
  Filter,
  CheckCircle2,
  Clock,
  ChevronRight,
  RefreshCw,
  Eye,
  Sliders,
  Maximize2,
  Minimize2,
  FileCode2,
  Server,
  KeyRound,
  FileText
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
  tier: number; // 0: foundation, 1: shell, 2: core, 3: infra
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
 description: "Responsive layouts, navigation bar, dark theme & Neo-brutalist tokens",
 agent: "Designer",
 files: ["src/App.tsx", "src/index.css"],
 metrics: "Tailwind v4 · 60fps · Zero Jank",
 dependencies: ["arch"],
 dependants: ["auth", "billing"],
    tier: 1,
    details: {
      specs: [
 "Sui high-contrast Neo-brutalist border tokens (#000F1D)",
 "Adaptive 12-column grid and mobile viewport bounds",
 "Tactile sound feedback hooks on user interactions",
 "Hardware-accelerated CSS transform transitions (150ms)",
      ],
 sampleCode: `export function AppShell({ children }: { children: React.ReactNode }) {\n return (\n <div className="bg-panel-alt dark:bg-[#0D121F] min-h-screen text-[#000F1D] dark:text-white font-sans">\n      {children}\n    </div>\n  );\n}`,
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

// Audio synthesizer for tactile canvas feedback
class CanvasAudioSynth {
  private ctx: AudioContext | null = null;

  private getCtx() {
 if (typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  playBeep(freq: number = 440) {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
 osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio fallback
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
      // Keep the user's selection across live updates; only fall back to the
      // first node when the selected one no longer exists.
      setSelectedNodeId((cur) =>
        customNodes.some((n) => n.id === cur) ? cur : customNodes[0].id
      );
    }
  }, [customNodes]);
 const [viewMode, setViewMode] = useState<ViewMode>("dag");
 const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [simulationActive, setSimulationActive] = useState<boolean>(true);
 const [inspectorTab, setInspectorTab] = useState<InspectorTab>("overview");
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [synthesizingNodeId, setSynthesizingNodeId] = useState<string | null>(null);
  const [pulseCount, setPulseCount] = useState<number>(0);

  // Active node lookup
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];
  }, [nodes, selectedNodeId]);

  // Simulation tick for visual pulse effects
  useEffect(() => {
    if (!simulationActive) return;
    const timer = setInterval(() => {
      setPulseCount((p) => (p + 1) % 100);
    }, 1800);
    return () => clearInterval(timer);
  }, [simulationActive]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
 if (categoryFilter === "all") return nodes;
    return nodes.filter((n) => n.category === categoryFilter);
  }, [nodes, categoryFilter]);

  // Verified metrics
  const verifiedCount = useMemo(() => {
 return nodes.filter((n) => n.status === "done").length;
  }, [nodes]);

  // Re-synthesize specific node in isolation
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
 toast.success(`Node "${nodeId.toUpperCase()}" synthesized & verified successfully`);
    }, 1600);
  };

  const handleCopyCode = (code: string) => {
    synth.playPop(900);
    navigator.clipboard.writeText(code);
 toast.success("Sample code copied to clipboard");
  };

  return (
 <div className="h-full w-full flex flex-col overflow-hidden bg-panel-alt dark:bg-[#0B0E17] font-mono text-neutral-900 dark:text-neutral-100 select-none">
      {/* =========================================================================
          CANVAS HEADER BAR: MODES, METRICS & CONTROLS
      ========================================================================= */}
 <div className="shrink-0 px-3 py-2 border-b-2 border-[#000F1D] bg-white dark:bg-[#121624] flex flex-wrap items-center justify-between gap-2 shadow-[0_2px_0_#000F1D] z-10">
        {/* Left Section: Topology Tag, Prompt Title & View Mode Switcher */}
 <div className="flex flex-wrap items-center gap-2 min-w-0">
 <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#FFD731] text-[#000F1D] border border-border font-black text-[10px] uppercase shadow-m3">
            <Workflow size={12} strokeWidth={2.5} />
            <span>TOPOLOGY_DAG</span>
          </div>

 <span className="font-bold text-xs truncate max-w-[200px] sm:max-w-xs text-neutral-700 dark:text-neutral-300 hidden sm:inline">
            &ldquo;{buildPrompt}&rdquo;
          </span>

          {/* View Mode Switcher Tabs */}
 <div className="flex items-center border border-border rounded bg-[#E5EEF8] dark:bg-[#1E2336] p-0.5 shadow-m3">
            <button
 type="button"
              onClick={() => {
                synth.playPop(700);
 setViewMode("dag");
              }}
              className={`px-2 py-1 text-[10px] font-black uppercase rounded flex items-center gap-1 transition-colors cursor-pointer ${
 viewMode === "dag"
 ? "bg-[#000F1D] text-white dark:bg-white dark:text-[#000F1D]"
 : "text-neutral-700 dark:text-neutral-300 hover:text-black"
              }`}
            >
              <Network size={11} />
              <span>DAG Graph</span>
            </button>

            <button
 type="button"
              onClick={() => {
                synth.playPop(750);
 setViewMode("pipeline");
              }}
              className={`px-2 py-1 text-[10px] font-black uppercase rounded flex items-center gap-1 transition-colors cursor-pointer ${
 viewMode === "pipeline"
 ? "bg-[#000F1D] text-white dark:bg-white dark:text-[#000F1D]"
 : "text-neutral-700 dark:text-neutral-300 hover:text-black"
              }`}
            >
              <Layers size={11} />
              <span>Pipeline</span>
            </button>

            <button
 type="button"
              onClick={() => {
                synth.playPop(800);
 setViewMode("matrix");
              }}
              className={`px-2 py-1 text-[10px] font-black uppercase rounded flex items-center gap-1 transition-colors cursor-pointer ${
 viewMode === "matrix"
 ? "bg-[#000F1D] text-white dark:bg-white dark:text-[#000F1D]"
 : "text-neutral-700 dark:text-neutral-300 hover:text-black"
              }`}
            >
              <TableIcon size={11} />
              <span>Matrix</span>
            </button>
          </div>
        </div>

        {/* Center/Right: Category Filters & Canvas Action Controls */}
 <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {/* Category Filter Dropdown / Buttons */}
 <div className="hidden lg:flex items-center gap-1 text-[10px] font-bold">
 {(["all", "foundation", "shell", "core", "infra"] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
 type="button"
                onClick={() => {
                  synth.playPop(650);
                  setCategoryFilter(cat);
                }}
                className={`px-1.5 py-0.5 border border-[#000F1D] rounded uppercase text-[9px] font-black cursor-pointer transition-colors ${
                  categoryFilter === cat
 ? "bg-[#4DA2FE] text-white"
 : "bg-white dark:bg-[#1E2336] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Verification Progress Chip */}
 <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#E8F8F0] dark:bg-[#0A241A] border border-border text-emerald-800 dark:text-emerald-300 rounded text-[10px] font-black shadow-m3">
 <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
            <span>{verifiedCount}/{nodes.length} VERIFIED</span>
          </div>

          {/* Simulation Toggle */}
          <button
 type="button"
            onClick={() => {
              synth.playPop(simulatingFreq(simulationActive));
              setSimulationActive((v) => !v);
 toast(simulationActive ? "Simulation paused" : "Simulation pulses streaming", { icon: "⚡" });
            }}
 title={simulationActive ? "Pause DAG packet stream" : "Start DAG packet stream"}
            className={`h-7 px-2 border border-border text-[10px] font-black uppercase rounded flex items-center gap-1 shadow-m3 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer ${
              simulationActive
 ? "bg-[#00F0FF] text-[#000F1D]"
 : "bg-white dark:bg-[#1A1E2E] text-neutral-500"
            }`}
          >
 <Activity size={11} className={simulationActive ? "animate-pulse" : ""} />
 <span className="hidden sm:inline">{simulationActive ? "SIM ON" : "SIM OFF"}</span>
          </button>

          {/* Zoom In/Out & Reset */}
 <div className="flex items-center border border-border rounded bg-white dark:bg-[#1A1E2E] shadow-m3">
            <button
 type="button"
              onClick={() => {
                synth.playPop(550);
                setZoomLevel((z) => Math.max(0.75, +(z - 0.1).toFixed(2)));
              }}
 title="Zoom out"
 className="p-1 hover:bg-neutral-100 dark:hover:bg-[#252A3D] text-neutral-700 dark:text-neutral-300"
            >
              <ZoomOut size={12} />
            </button>
 <span className="text-[10px] font-black px-1 text-neutral-800 dark:text-neutral-200">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
 type="button"
              onClick={() => {
                synth.playPop(650);
                setZoomLevel((z) => Math.min(1.4, +(z + 0.1).toFixed(2)));
              }}
 title="Zoom in"
 className="p-1 hover:bg-neutral-100 dark:hover:bg-[#252A3D] text-neutral-700 dark:text-neutral-300"
            >
              <ZoomIn size={12} />
            </button>
            <button
 type="button"
              onClick={() => {
                synth.playPop(600);
                setZoomLevel(1);
              }}
 title="Reset Zoom"
 className="p-1 border-l border-[#000F1D] hover:bg-neutral-100 dark:hover:bg-[#252A3D] text-neutral-700 dark:text-neutral-300"
            >
              <RotateCcw size={11} />
            </button>
          </div>

          {/* Inspector Panel Toggle Button */}
          <button
 type="button"
            onClick={() => {
              synth.playPop(850);
              setInspectorOpen((v) => !v);
            }}
            className={`h-7 px-2 border border-border text-[10px] font-black uppercase rounded flex items-center gap-1 shadow-m3 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer ${
 inspectorOpen ? "bg-[#FFD731] text-black" : "bg-white dark:bg-[#1E2336] text-neutral-700 dark:text-neutral-300"
            }`}
 title="Toggle Node Inspector drawer"
          >
            <Sliders size={12} />
 <span className="hidden md:inline">INSPECTOR</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKBENCH AREA: GRAPH / PIPELINE / MATRIX + INSPECTOR DRAWER
      ========================================================================= */}
 <div className="flex-1 min-h-0 flex flex-col lg:flex-row relative overflow-hidden">
        {/* VIEW 1: INTERACTIVE DAG GRAPH */}
 {viewMode === "dag" && (
          <div
            className={`flex-1 relative overflow-auto p-4 sm:p-6 transition-transform origin-top-left ${
              showGrid
 ? "bg-[radial-gradient(#00000015_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff15_1px,transparent_1px)] [background-size:16px_16px]"
 : ""
            }`}
 style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center top" }}
          >
 <div className="max-w-2xl mx-auto flex flex-col items-center gap-4 py-2 relative">
              {/* TIER 0: ARCHITECTURE FOUNDATION */}
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

              {/* CONNECTING WIRE 0 -> 1 with animated pulse */}
              <DAGConnectionPipe
                isFlowing={simulationActive}
                pulseOffset={pulseCount}
 isActive={selectedNodeId === "arch" || selectedNodeId === "shell"}
              />

              {/* TIER 1: APP SHELL & NAVIGATION */}
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

              {/* CONNECTING SPLIT TREE: 1 -> 2,3,4 */}
 <div className="w-full max-w-lg flex flex-col items-center my-0.5">
                <div
                  className={`w-0.5 h-3.5 transition-colors ${
 selectedNodeId === "shell" ? "bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]" : "bg-[#000F1D] dark:bg-white"
                  }`}
                />
                <div
                  className={`w-full h-0.5 transition-colors ${
 selectedNodeId === "shell" ? "bg-[#00F0FF]" : "bg-[#000F1D] dark:bg-white"
                  }`}
                />
 <div className="w-full flex justify-between">
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
                </div>
              </div>

              {/* TIER 2: CORE TRIAD (AUTH, BILLING, DB) */}
 <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl">
                {/* Node 2: Auth */}
                <DAGNodeCard
                  node={nodes[2]}
                  isSelected={selectedNodeId === nodes[2].id}
                  isSynthesizing={synthesizingNodeId === nodes[2].id}
                  onClick={() => {
                    synth.playPop(1000);
                    setSelectedNodeId(nodes[2].id);
                  }}
                  onSelectFile={onSelectNodeFile}
                />

                {/* Node 3: Billing */}
                <DAGNodeCard
                  node={nodes[3]}
                  isSelected={selectedNodeId === nodes[3].id}
                  isSynthesizing={synthesizingNodeId === nodes[3].id}
                  isHighlight
                  onClick={() => {
                    synth.playPop(1050);
                    setSelectedNodeId(nodes[3].id);
                  }}
                  onSelectFile={onSelectNodeFile}
                />

                {/* Node 4: DB */}
                <DAGNodeCard
                  node={nodes[4]}
                  isSelected={selectedNodeId === nodes[4].id}
                  isSynthesizing={synthesizingNodeId === nodes[4].id}
                  onClick={() => {
                    synth.playPop(1100);
                    setSelectedNodeId(nodes[4].id);
                  }}
                  onSelectFile={onSelectNodeFile}
                />
              </div>

              {/* CONNECTING CONVERGENCE: 2,3,4 -> 5 */}
 <div className="w-full max-w-lg flex flex-col items-center my-0.5">
 <div className="w-full flex justify-between">
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
                </div>
 <div className="w-full h-0.5 bg-[#000F1D] dark:bg-white" />
 <div className="w-0.5 h-3.5 bg-[#000F1D] dark:bg-white" />
              </div>

              {/* TIER 3: EDGE CLOUD DEPLOYMENT */}
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
            </div>
          </div>
        )}

        {/* VIEW 2: PIPELINE STAGES KANBAN / COLUMNS */}
 {viewMode === "pipeline" && (
 <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-stretch min-w-max">
            {[
 { title: "FOUNDATION", tier: 0, color: "bg-[#E0F2FE] border-[#0284C7] text-[#0369A1]" },
 { title: "APP SHELL", tier: 1, color: "bg-[#FEF3C7] border-[#D97706] text-[#B45309]" },
 { title: "CORE SERVICES", tier: 2, color: "bg-[#DCFCE7] border-[#16A34A] text-[#15803D]" },
 { title: "EDGE INFRA", tier: 3, color: "bg-[#F3E8FF] border-[#9333EA] text-[#7E22CE]" },
            ].map((col) => {
              const colNodes = nodes.filter((n) => n.tier === col.tier);
              return (
                <div
                  key={col.title}
 className="w-72 bg-white dark:bg-[#121624] border border-border rounded-xl shadow-m3 flex flex-col overflow-hidden"
                >
                  <div className={`p-2.5 border-b-2 border-[#000F1D] font-black text-xs uppercase flex items-center justify-between ${col.color}`}>
                    <span>{col.title}</span>
 <span className="px-2 py-0.5 bg-white dark:bg-black border border-[#000F1D] text-[10px] rounded font-mono">
                      {colNodes.length} NODES
                    </span>
                  </div>

 <div className="p-3 flex-1 overflow-y-auto space-y-3 bg-[#FAF8F5] dark:bg-[#0B0E17]">
                    {colNodes.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          synth.playPop(900);
                          setSelectedNodeId(n.id);
                        }}
                        className={`p-3 border border-border rounded-lg transition-all cursor-pointer ${
                          selectedNodeId === n.id
 ? "bg-[#FFD731] shadow-m3"
 : "bg-white dark:bg-[#181D2E] shadow-m3 hover:bg-neutral-50 dark:hover:bg-[#20263C]"
                        }`}
                      >
 <div className="flex items-center justify-between mb-1">
 <span className="font-black text-xs uppercase truncate">{n.label}</span>
 <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
 {n.status === "done" ? "✓ READY" : "⏳ BUILDING"}
                          </span>
                        </div>
 <p className="text-[11px] text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2 font-sans">
                          {n.description}
                        </p>
 <div className="flex items-center justify-between text-[10px] font-mono">
 <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded">
                            {n.agent}
                          </span>
 <span className="text-neutral-500 font-bold">{n.files.length} Files</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 3: ARCHITECTURE DEPENDENCY MATRIX */}
 {viewMode === "matrix" && (
 <div className="flex-1 overflow-auto p-4">
 <div className="max-w-4xl mx-auto bg-white dark:bg-[#121624] border border-border rounded-xl shadow-m3 overflow-hidden">
 <div className="p-3 border-b-2 border-[#000F1D] bg-panel-alt dark:bg-[#1A1F30] flex items-center justify-between">
 <span className="font-black text-xs uppercase flex items-center gap-1.5">
 <TableIcon size={14} className="text-[#1D4ED8]" />
                  <span>DIRECTED ACYCLIC GRAPH (DAG) RESOLUTION MATRIX</span>
                </span>
 <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400 font-mono text-[10px] font-bold rounded">
                  CYCLE_ANALYSIS: 0 CYCLES
                </span>
              </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs font-mono">
 <thead className="bg-panel-alt dark:bg-[#181D2E] border-b-2 border-[#000F1D] font-black uppercase text-[11px]">
                    <tr>
 <th className="p-2.5">Node ID</th>
 <th className="p-2.5">Module Name</th>
 <th className="p-2.5">Category</th>
 <th className="p-2.5">Upstream (Inputs)</th>
 <th className="p-2.5">Downstream (Consumers)</th>
 <th className="p-2.5">Agent</th>
 <th className="p-2.5 text-right">Status</th>
                    </tr>
                  </thead>
 <tbody className="divide-y border-[#000F1D]">
                    {nodes.map((n) => (
                      <tr
                        key={n.id}
                        onClick={() => {
                          synth.playPop(850);
                          setSelectedNodeId(n.id);
                        }}
                        className={`cursor-pointer transition-colors ${
                          selectedNodeId === n.id
 ? "bg-[#FFD731]/30 font-bold"
 : "hover:bg-neutral-50 dark:hover:bg-[#1B2134]"
                        }`}
                      >
 <td className="p-2.5 font-black text-[#1D4ED8]">{n.id}</td>
 <td className="p-2.5 font-bold">{n.label}</td>
 <td className="p-2.5 uppercase text-[10px] font-bold">{n.category}</td>
 <td className="p-2.5">
                          {n.dependencies.length > 0 ? (
 <div className="flex gap-1 flex-wrap">
                              {n.dependencies.map((d) => (
 <span key={d} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 rounded text-[9px]">
                                  {d}
                                </span>
                              ))}
                            </div>
                          ) : (
 <span className="text-neutral-400 text-[10px]">Root (None)</span>
                          )}
                        </td>
 <td className="p-2.5">
                          {n.dependants.length > 0 ? (
 <div className="flex gap-1 flex-wrap">
                              {n.dependants.map((d) => (
 <span key={d} className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 rounded text-[9px]">
                                  {d}
                                </span>
                              ))}
                            </div>
                          ) : (
 <span className="text-neutral-400 text-[10px]">Leaf (Edge Sink)</span>
                          )}
                        </td>
 <td className="p-2.5">{n.agent}</td>
 <td className="p-2.5 text-right font-black">
 {n.status === "done" ? (
 <span className="text-emerald-600">✓ VERIFIED</span>
                          ) : (
 <span className="text-amber-600">⏳ SYNTHESIZING</span>
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

        {/* =========================================================================
            RIGHT/BOTTOM: EXPANDABLE NODE INSPECTOR DRAWER
        ========================================================================= */}
        {inspectorOpen && (
 <div className="w-full lg:w-96 border-t-2 lg:border-t-0 lg:border-l-2 border-[#000F1D] bg-white dark:bg-[#121624] flex flex-col shrink-0 shadow-m3 max-h-[50vh] lg:max-h-full overflow-hidden">
            {/* Inspector Header */}
 <div className="p-3 border-b-2 border-[#000F1D] bg-panel-alt dark:bg-[#1A1F30] flex items-center justify-between">
 <div className="flex items-center gap-2 min-w-0">
 <span className="px-2 py-0.5 bg-[#FFD731] text-black border border-[#000F1D] text-[10px] font-black uppercase rounded shadow-m3">
                  {selectedNode.category}
                </span>
 <span className="font-black text-xs uppercase truncate text-neutral-900 dark:text-white">
                  {selectedNode.label}
                </span>
              </div>

 <div className="flex items-center gap-1">
                <button
 type="button"
                  onClick={() => handleSynthesizeNode(selectedNode.id)}
                  disabled={synthesizingNodeId === selectedNode.id}
 title="Re-synthesize node AST"
 className="p-1 border border-[#000F1D] bg-white dark:bg-[#20263C] rounded hover:bg-[#00F0FF] text-neutral-800 dark:text-neutral-200 cursor-pointer disabled:opacity-50"
                >
 <RefreshCw size={12} className={synthesizingNodeId === selectedNode.id ? "animate-spin" : ""} />
                </button>
                <button
 type="button"
                  onClick={() => setInspectorOpen(false)}
 title="Close Inspector"
 className="p-1 text-neutral-500 hover:text-black dark:hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Inspector Navigation Tabs */}
 <div className="flex border-b-2 border-[#000F1D] bg-[#FAF8F5] dark:bg-[#141828] text-[10px] font-black uppercase">
 {(["overview", "code", "endpoints", "diagnostics"] as InspectorTab[]).map((tab) => (
                <button
                  key={tab}
 type="button"
                  onClick={() => {
                    synth.playPop(650);
                    setInspectorTab(tab);
                  }}
                  className={`flex-1 py-2 text-center transition-colors cursor-pointer border-r border-[#000F1D] last:border-r-0 ${
                    inspectorTab === tab
 ? "bg-[#000F1D] text-white dark:bg-white dark:text-[#000F1D]"
 : "text-neutral-600 dark:text-neutral-400 hover:bg-[#FFD731] hover:text-black"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Inspector Body Content */}
 <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* TAB 1: OVERVIEW & SPECS */}
 {inspectorTab === "overview" && (
 <div className="space-y-3">
                  <div>
 <div className="text-[10px] font-black uppercase text-neutral-500 mb-1">Description</div>
 <p className="text-xs font-sans text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      {selectedNode.description}
                    </p>
                  </div>

                  {/* Architecture Specifications */}
                  <div>
 <div className="text-[10px] font-black uppercase text-neutral-500 mb-1.5 flex items-center justify-between">
                      <span>Architecture Specs</span>
                      {selectedNode.details.specs.length > 0 && (
 <span className="text-emerald-600 dark:text-emerald-400 font-bold">100% SATISFIED</span>
                      )}
                    </div>
 <ul className="space-y-1.5">
                      {selectedNode.details.specs.map((spec, i) => (
                        <li
                          key={i}
 className="flex items-start gap-1.5 text-xs text-neutral-800 dark:text-neutral-200 bg-panel-alt dark:bg-[#1A1F30] p-1.5 rounded border border-[#000F1D]/20"
                        >
 <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" />
 <span className="leading-snug">{spec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Node Dependencies & Consumers */}
 <div className="grid grid-cols-2 gap-2 text-[10px]">
 <div className="p-2 border border-[#000F1D] rounded bg-[#FAF8F5] dark:bg-[#161B2C]">
 <span className="font-black uppercase text-neutral-500 block mb-1">Inputs (Upstream)</span>
                      {selectedNode.dependencies.length > 0 ? (
 <div className="space-y-1">
                          {selectedNode.dependencies.map((d) => (
                            <button
                              key={d}
 type="button"
                              onClick={() => setSelectedNodeId(d)}
 className="w-full text-left font-bold text-[#1D4ED8] dark:text-cyan-400 hover:underline"
                            >
                              ← {d.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      ) : (
 <span className="text-neutral-400">Root Node</span>
                      )}
                    </div>

 <div className="p-2 border border-[#000F1D] rounded bg-[#FAF8F5] dark:bg-[#161B2C]">
 <span className="font-black uppercase text-neutral-500 block mb-1">Outputs (Downstream)</span>
                      {selectedNode.dependants.length > 0 ? (
 <div className="space-y-1">
                          {selectedNode.dependants.map((d) => (
                            <button
                              key={d}
 type="button"
                              onClick={() => setSelectedNodeId(d)}
 className="w-full text-left font-bold text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              → {d.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      ) : (
 <span className="text-neutral-400">Edge Sink</span>
                      )}
                    </div>
                  </div>

                  {/* Connected Source Files */}
                  <div>
 <div className="text-[10px] font-black uppercase text-neutral-500 mb-1.5">Affected File Assets</div>
 <div className="space-y-1">
                      {selectedNode.files.map((file) => (
                        <button
                          key={file}
 type="button"
                          onClick={() => {
                            synth.playPop(950);
                            onSelectNodeFile?.(file);
                          }}
 className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-[#1A1F30] border border-border rounded font-bold text-xs hover:bg-[#FFD731] hover:text-black transition-colors cursor-pointer shadow-m3"
                        >
 <div className="flex items-center gap-1.5 truncate">
 <FileCode2 size={13} className="text-[#1D4ED8]" />
 <span className="truncate">{file}</span>
                          </div>
 <span className="text-[10px] text-neutral-500 font-mono shrink-0">Open →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: LIVE CODE SNIPPET */}
 {inspectorTab === "code" && (
 <div className="space-y-2">
 <div className="flex items-center justify-between text-[10px]">
 <span className="font-black uppercase text-neutral-500">
 Contract Implementation ({selectedNode.files[0] || "snippet.ts"})
                    </span>
                    {selectedNode.details.sampleCode && (
                      <button
 type="button"
                        onClick={() => handleCopyCode(selectedNode.details.sampleCode!)}
 className="flex items-center gap-1 px-2 py-0.5 border border-[#000F1D] rounded bg-white dark:bg-[#20263C] hover:bg-[#FFD731] hover:text-black font-bold cursor-pointer"
                      >
                        <Copy size={10} />
                        <span>Copy</span>
                      </button>
                    )}
                  </div>

                  {selectedNode.details.sampleCode ? (
 <div className="bg-[#0C0D10] text-[#E0E0E0] border border-border p-3 font-mono text-[11px] rounded-lg overflow-x-auto shadow-m3 leading-relaxed">
                      <pre>{selectedNode.details.sampleCode}</pre>
                    </div>
                  ) : (
 <div className="p-4 text-center text-neutral-400 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-xs">
                      No code sample declared for this node.
                    </div>
                  )}

                  {selectedNode.files[0] && (
                    <button
 type="button"
                      onClick={() => onSelectNodeFile?.(selectedNode.files[0])}
 className="w-full h-8 bg-[#000F1D] text-white dark:bg-white dark:text-[#000F1D] rounded font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-m3 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                    >
                      <Code2 size={13} />
                      <span>Edit {selectedNode.files[0]} in Code Studio</span>
                    </button>
                  )}
                </div>
              )}

              {/* TAB 3: API CONTRACTS & ENDPOINTS */}
 {inspectorTab === "endpoints" && (
 <div className="space-y-2">
 <div className="text-[10px] font-black uppercase text-neutral-500 mb-1">
                    Route Handlers & Edge Sockets
                  </div>
                  {selectedNode.details.endpoints && selectedNode.details.endpoints.length > 0 ? (
 <div className="space-y-1.5">
                      {selectedNode.details.endpoints.map((ep, idx) => {
 const parts = ep.split(" ");
                        const method = parts[0];
                        const path = parts[1] || ep;
                        return (
                          <div
                            key={idx}
 className="p-2 border border-border rounded bg-[#FAF8F5] dark:bg-[#1A1F30] flex items-center justify-between font-mono text-xs shadow-m3"
                          >
 <div className="flex items-center gap-2 truncate">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
 method === "POST"
 ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border border-blue-400"
 : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-400"
                                }`}
                              >
                                {method}
                              </span>
 <span className="font-bold truncate text-neutral-800 dark:text-neutral-200">
                                {path}
                              </span>
                            </div>
 <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-black shrink-0">
                              200 OK
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
 <div className="p-4 text-center text-neutral-400 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-xs">
                      Internal architectural abstraction; no HTTP endpoint exposed.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: AGENT DIAGNOSTICS & AST LOGS */}
 {inspectorTab === "diagnostics" && (
 <div className="space-y-2">
 <div className="flex items-center justify-between text-[10px]">
 <span className="font-black uppercase text-neutral-500">
                      Live AST Synthesis Stream ({selectedNode.agent} Agent)
                    </span>
 <span className="text-emerald-600 font-bold">● ACTIVE</span>
                  </div>

 <div className="bg-[#0C0D10] text-[#00F0FF] border border-border p-3 font-mono text-[10px] rounded-lg overflow-x-auto shadow-m3 space-y-1.5 leading-relaxed">
                    {selectedNode.details.diagnostics && selectedNode.details.diagnostics.length > 0 ? (
                      selectedNode.details.diagnostics.map((log, idx) => (
 <div key={idx} className="flex items-start gap-1.5">
 <Terminal size={11} className="text-neutral-500 shrink-0 mt-0.5" />
 <span className="text-neutral-200">{log}</span>
                        </div>
                      ))
                    ) : (
 <div className="text-neutral-400">Node AST verification idle.</div>
                    )}
 <div className="text-emerald-400 pt-1">
                      → [SUCCESS] Verified AST invariants for {selectedNode.id}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Action Footer inside Inspector */}
 <div className="p-2.5 border-t-2 border-[#000F1D] bg-[#FAF8F5] dark:bg-[#141828] flex items-center justify-between gap-2">
 {selectedNode.id === "billing" && (
                <button
 type="button"
                  onClick={() => {
                    synth.playPop(1100);
                    onOpenPreview?.();
                  }}
 className="flex-1 h-8 bg-[#00F0FF] hover:bg-[#FFD731] text-[#000F1D] border border-border rounded font-black text-xs uppercase flex items-center justify-center gap-1 shadow-m3 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <Eye size={12} strokeWidth={2.4} />
                  <span>Preview Checkout</span>
                </button>
              )}

              <button
 type="button"
                onClick={() => handleSynthesizeNode(selectedNode.id)}
                disabled={synthesizingNodeId === selectedNode.id}
 className="flex-1 h-8 bg-[#1A1A1A] hover:bg-black text-white dark:bg-white dark:text-black border border-border rounded font-black text-xs uppercase flex items-center justify-center gap-1 shadow-m3 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
 <Sparkles size={12} className="text-amber-400" />
 <span>{synthesizingNodeId === selectedNode.id ? "Synthesizing…" : "Re-Synthesize"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// DAG NODE CARD COMPONENT
// -----------------------------------------------------------------------------
interface DAGNodeCardProps {
  node: CanvasNode;
  isSelected: boolean;
  isSynthesizing: boolean;
  isHighlight?: boolean;
  onClick: () => void;
  onSelectFile?: (file: string) => void;
}

function DAGNodeCard({
  node,
  isSelected,
  isSynthesizing,
  isHighlight = false,
  onClick,
  onSelectFile,
}: DAGNodeCardProps) {
 const isDone = node.status === "done";

  // Category badge colors
  const categoryBadge = {
 foundation: "bg-[#E0F2FE] text-[#0369A1] border-[#0284C7]",
 shell: "bg-[#FEF3C7] text-[#B45309] border-[#D97706]",
 core: "bg-[#DCFCE7] text-[#15803D] border-[#16A34A]",
 infra: "bg-[#F3E8FF] text-[#7E22CE] border-[#9333EA]",
  }[node.category];

  return (
    <div
      onClick={onClick}
      className={`relative w-full max-w-sm rounded-xl border border-border p-3 transition-all cursor-pointer select-none ${
        isSelected
 ? "bg-[#FFD731] text-[#000F1D] shadow-m3 -translate-y-0.5"
          : isHighlight
 ? "bg-white dark:bg-[#181D2E] text-neutral-900 dark:text-white shadow-m3 "
 : "bg-white dark:bg-[#161B2A] text-neutral-900 dark:text-white shadow-m3 "
      }`}
    >
      {/* Card Header: Category Chip & Status Pill */}
 <div className="flex items-center justify-between mb-1.5">
        <span
          className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${categoryBadge}`}
        >
          {node.category}
        </span>

 <div className="flex items-center gap-1.5">
          {isSynthesizing ? (
 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-400 text-black border border-black rounded text-[9px] font-black animate-pulse">
 <Loader2 size={10} className="animate-spin" /> SYNTHESIZING
            </span>
          ) : isDone ? (
 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400 rounded text-[9px] font-black">
              ✓ VERIFIED
            </span>
 ) : node.status === "queued" ? (
 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-100 text-neutral-600 dark:bg-white/5 dark:text-neutral-400 border border-neutral-300 dark:border-white/15 rounded text-[9px] font-black">
              <Clock size={10} /> QUEUED
            </span>
          ) : (
 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-400 rounded text-[9px] font-black">
              <Clock size={10} /> ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Node Title & Description */}
 <div className="mb-2">
 <div className="flex items-baseline justify-between gap-1">
 <h3 className="font-mono text-xs sm:text-sm font-black uppercase tracking-tight truncate">
            {node.label}
          </h3>
 <span className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 font-bold shrink-0">
            {node.agent} Agent
          </span>
        </div>
 <p className="text-[11px] font-sans text-neutral-600 dark:text-neutral-300 line-clamp-2 mt-0.5 leading-tight">
          {node.description}
        </p>
      </div>

      {/* Metrics & Files Trigger Footer */}
 <div className="flex items-center justify-between pt-1 border-t border-[#000F1D]/20 text-[10px] font-mono">
 <span className="text-neutral-600 dark:text-neutral-400 font-semibold truncate max-w-[170px]">
          {node.metrics}
        </span>

 <div className="flex items-center gap-1">
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
 className="px-1.5 py-0.5 bg-panel-alt dark:bg-[#1E2336] border border-[#000F1D] rounded hover:bg-[#FFD731] hover:text-black font-bold text-[9px] flex items-center gap-1 cursor-pointer"
            >
              <Code2 size={9} />
 <span>{f.split("/").pop()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SVG CONNECTION PIPE WITH FLOWING DATA PULSE
// -----------------------------------------------------------------------------
interface DAGConnectionPipeProps {
  isFlowing: boolean;
  pulseOffset: number;
  isActive: boolean;
}

function DAGConnectionPipe({ isFlowing, pulseOffset, isActive }: DAGConnectionPipeProps) {
  return (
 <div className="relative flex flex-col items-center my-0.5">
      <div
        className={`w-0.5 h-6 transition-colors ${
 isActive ? "bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]" : "bg-[#000F1D] dark:bg-white"
        }`}
      />
      {isFlowing && (
        <span
 className="absolute w-2 h-2 rounded-full bg-[#00F0FF] border border-[#000F1D] animate-ping"
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
