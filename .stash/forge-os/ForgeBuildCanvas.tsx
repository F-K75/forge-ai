import { useState } from "react";
import { Check, Loader2, ArrowRight, ShieldCheck, CreditCard, Database, Globe, Layers, Cpu, Sparkles, ExternalLink, Code2 } from "lucide-react";
import { motion } from "motion/react";

export interface CanvasNode {
  id: string;
  label: string;
  category: "foundation" | "shell" | "core" | "infra";
  status: "done" | "building" | "queued";
  description: string;
  agent: string;
  files: string[];
  metrics?: string;
  details: {
    specs: string[];
    endpoints?: string[];
    sampleCode?: string;
  };
}

const DEFAULT_NODES: CanvasNode[] = [
  {
    id: "arch",
    label: "Architecture",
    category: "foundation",
    status: "done",
    description: "System topology, state management, and API contracts",
    agent: "Architect",
    files: ["src/types/api.ts", "src/lib/constants.ts"],
    metrics: "Clean DAG · 0 cycles",
    details: {
      specs: [
        "TypeScript 5.4 strict typed contracts",
        "Zod runtime validation schemas",
        "Edge-compatible Hono router interface",
      ],
      sampleCode: `export interface UserSession {\n  userId: string;\n  tenantId: string;\n  role: 'owner' | 'admin' | 'member';\n  expiresAt: number;\n}`,
    },
  },
  {
    id: "shell",
    label: "App Shell",
    category: "shell",
    status: "done",
    description: "Responsive layouts, navigation bar, and design tokens",
    agent: "Designer",
    files: ["src/App.tsx", "src/index.css"],
    metrics: "Tailwind CSS · Warm Graphite",
    details: {
      specs: [
        "Near-black / graphite background (#0B0D10)",
        "Molten amber signature accent (#FF5722)",
        "Mobile & desktop adaptive layouts",
      ],
      sampleCode: `export function AppShell({ children }: { children: React.ReactNode }) {\n  return <div className="bg-[#0B0D10] text-[#F4F4F6] min-h-screen">{children}</div>;\n}`,
    },
  },
  {
    id: "auth",
    label: "Auth",
    category: "core",
    status: "done",
    description: "Google & GitHub OAuth 2.1, PKCE verification & JWT sessions",
    agent: "Builder",
    files: ["src/api/auth.ts", "src/lib/session.ts"],
    metrics: "PKCE · SHA-256 · HTTP-only",
    details: {
      specs: [
        "Google Identity Services token client",
        "Session verification with rotating JWTs",
        "CSRF prevention with SameSite=Lax cookies",
      ],
      endpoints: ["POST /api/auth/google", "POST /api/auth/refresh", "GET /api/auth/me"],
      sampleCode: `export async function verifyGoogleToken(token: string) {\n  const payload = await jwtVerify(token, GOOGLE_JWKS);\n  return { email: payload.email, sub: payload.sub };\n}`,
    },
  },
  {
    id: "billing",
    label: "Billing",
    category: "core",
    status: "building",
    description: "Stripe subscription checkout, billing portal & webhook events",
    agent: "Builder",
    files: ["src/api/checkout.ts", "src/components/Checkout.tsx"],
    metrics: "Stripe v3 · Idempotency keys",
    details: {
      specs: [
        "Stripe Elements checkout embedding",
        "Webhook signature validation via STRIPE_WEBHOOK_SECRET",
        "Tiers: Pro ($19/mo) and Scale ($49/mo)",
      ],
      endpoints: ["POST /api/checkout/session", "POST /api/webhooks/stripe"],
      sampleCode: `export async function handleStripeWebhook(event: Stripe.Event) {\n  switch (event.type) {\n    case 'checkout.session.completed':\n      await activateSubscription(event.data.object);\n  }\n}`,
    },
  },
  {
    id: "db",
    label: "DB",
    category: "core",
    status: "done",
    description: "PostgreSQL schema, foreign key relations & connection pooling",
    agent: "Builder",
    files: ["src/db/schema.sql", "src/db/client.ts"],
    metrics: "PostgreSQL 16 · Pooled",
    details: {
      specs: [
        "Relational schemas for users, accounts, and subscriptions",
        "Automatic created_at and updated_at triggers",
        "Zero-downtime migration scripts",
      ],
      sampleCode: `CREATE TABLE users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email VARCHAR(255) UNIQUE NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);`,
    },
  },
  {
    id: "deploy",
    label: "Deployment",
    category: "infra",
    status: "building",
    description: "Global edge CDN, automated TLS certificates & health checks",
    agent: "DevOps",
    files: ["wrangler.toml", "deploy.config.ts"],
    metrics: "Edge runtime · <20ms latency",
    details: {
      specs: [
        "Sub-20ms edge replication worldwide",
        "Automated SSL handshake and HTTPS redirection",
        "Zero-downtime blue/green swap",
      ],
      endpoints: ["GET /healthz", "GET /metrics"],
      sampleCode: `export default {\n  async fetch(request, env) {\n    return new Response('Edge cluster healthy: 200 OK');\n  }\n};`,
    },
  },
];

interface ForgeBuildCanvasProps {
  onSelectNodeFile?: (filename: string) => void;
  onOpenPreview?: () => void;
  buildPrompt?: string;
}

export function ForgeBuildCanvas({
  onSelectNodeFile,
  onOpenPreview,
  buildPrompt = "Build SaaS landing page with Stripe checkout",
}: ForgeBuildCanvasProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>(DEFAULT_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("billing");

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes[3];

  return (
    <div className="h-full flex flex-col justify-between overflow-hidden bg-[#090A0E] select-none p-4 sm:p-6">
      {/* Canvas Top Bar: Prompt & State */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#FF5722] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#FF5722] font-semibold">
              Forge is Building
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-[#F4F4F6] tracking-tight mt-0.5 font-sans">
            &ldquo;{buildPrompt}&rdquo;
          </h2>
        </div>

        {/* Metaphor Flow Indicator: Idea -> Plan -> Build -> Test -> Forge -> Ship */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#888B96]">
          <span className="text-[#888B96]">Idea</span>
          <span className="text-[#5A5D68]">→</span>
          <span className="text-[#888B96]">Plan</span>
          <span className="text-[#5A5D68]">→</span>
          <span className="text-[#FF5722] font-semibold">Build</span>
          <span className="text-[#5A5D68]">→</span>
          <span className="text-[#888B96]">Test</span>
          <span className="text-[#5A5D68]">→</span>
          <span className="text-[#FF5722]">Forge</span>
          <span className="text-[#5A5D68]">→</span>
          <span className="text-[#5A5D68]">Ship</span>
        </div>
      </div>

      {/* Center Interactive Graph Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center my-4 overflow-y-auto px-2">
        <div className="w-full max-w-xl flex flex-col items-center gap-4 relative py-2">
          {/* Node: Architecture */}
          {renderNode(
            nodes[0],
            selectedNodeId === nodes[0].id,
            () => setSelectedNodeId(nodes[0].id)
          )}

          {/* Connector to App Shell */}
          <div className="w-px h-6 bg-gradient-to-b from-white/20 to-white/10" />

          {/* Node: App Shell */}
          {renderNode(
            nodes[1],
            selectedNodeId === nodes[1].id,
            () => setSelectedNodeId(nodes[1].id)
          )}

          {/* Connector branching down to Auth, Billing, DB */}
          <div className="relative w-full flex flex-col items-center my-1">
            <div className="w-px h-4 bg-white/20" />
            <div className="w-3/4 max-w-md h-px bg-white/20" />
            <div className="w-3/4 max-w-md flex justify-between">
              <div className="w-px h-4 bg-white/20" />
              <div className="w-px h-4 bg-white/20" />
              <div className="w-px h-4 bg-white/20" />
            </div>
          </div>

          {/* Core Triad: Auth | Billing | DB */}
          <div className="w-full grid grid-cols-3 gap-3 sm:gap-4 max-w-lg">
            {renderNode(
              nodes[2],
              selectedNodeId === nodes[2].id,
              () => setSelectedNodeId(nodes[2].id)
            )}
            {renderNode(
              nodes[3],
              selectedNodeId === nodes[3].id,
              () => setSelectedNodeId(nodes[3].id),
              true // Highlighted Billing
            )}
            {renderNode(
              nodes[4],
              selectedNodeId === nodes[4].id,
              () => setSelectedNodeId(nodes[4].id)
            )}
          </div>

          {/* Connector converging down to Deployment */}
          <div className="relative w-full flex flex-col items-center my-1">
            <div className="w-3/4 max-w-md flex justify-between">
              <div className="w-px h-4 bg-white/20" />
              <div className="w-px h-4 bg-white/20" />
              <div className="w-px h-4 bg-white/20" />
            </div>
            <div className="w-3/4 max-w-md h-px bg-white/20" />
            <div className="w-px h-4 bg-white/20" />
          </div>

          {/* Node: Deployment */}
          {renderNode(
            nodes[5],
            selectedNodeId === nodes[5].id,
            () => setSelectedNodeId(nodes[5].id)
          )}
        </div>
      </div>

      {/* Bottom Node Inspector: Focuses interface on clicked node! */}
      <div className="shrink-0 bg-[#0E1015] border border-white/[0.08] rounded-xl p-4 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-[#FF5722] font-semibold">
              Focused Node: {selectedNode.label}
            </span>
            <span className="text-[10px] font-mono text-[#888B96] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.04]">
              {selectedNode.metrics}
            </span>
            <span className="text-[10px] font-mono text-[#30D158]">
              {selectedNode.status === "done" ? "✓ Verified" : "◉ Active Agent: " + selectedNode.agent}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedNode.files.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => onSelectNodeFile?.(file)}
                className="flex items-center gap-1 text-[11px] font-mono text-[#888B96] hover:text-[#F4F4F6] bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1 rounded transition border border-white/[0.06]"
              >
                <Code2 size={11} className="text-[#FF5722]" />
                <span>{file}</span>
              </button>
            ))}

            {selectedNode.id === "billing" && (
              <button
                type="button"
                onClick={onOpenPreview}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#FF5722] text-white text-xs font-semibold hover:bg-[#FF7A1A] transition shadow-sm ml-2"
              >
                <span>Preview Checkout</span>
                <ExternalLink size={11} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[#A0A3AF] font-sans text-xs mb-2">
              {selectedNode.description}
            </p>
            <ul className="space-y-1">
              {selectedNode.details.specs.map((spec, sIdx) => (
                <li key={sIdx} className="flex items-center gap-2 text-[#888B96] font-mono text-[11px]">
                  <span className="text-[#30D158]">✓</span>
                  <span>{spec}</span>
                </li>
              ))}
            </ul>
          </div>

          {selectedNode.details.sampleCode && (
            <div className="bg-[#07080A] rounded-lg p-2.5 font-mono text-[10px] text-[#A0A3AF] border border-white/[0.04] overflow-x-auto">
              <pre>{selectedNode.details.sampleCode}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderNode(
  node: CanvasNode,
  isSelected: boolean,
  onClick: () => void,
  isSpecialAccent: boolean = false
) {
  const isDone = node.status === "done";
  const isBuilding = node.status === "building";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative px-4 py-2.5 rounded-xl border text-left transition-all w-full flex items-center justify-between gap-3 select-none ${
        isSelected
          ? "bg-[#14161F] border-[#FF5722] shadow-lg shadow-[#FF5722]/10 ring-1 ring-[#FF5722]/50"
          : isSpecialAccent
          ? "bg-[#10121A] border-[#FF5722]/40 hover:border-[#FF5722] text-[#F4F4F6]"
          : "bg-[#0E1016] border-white/[0.08] hover:border-white/[0.18] text-[#D1D4DC]"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0 flex items-center justify-center">
          {isDone ? (
            <span className="h-4 w-4 rounded-full bg-[#30D158]/20 text-[#30D158] flex items-center justify-center text-[10px]">
              <Check size={10} strokeWidth={3} />
            </span>
          ) : isBuilding ? (
            <span className="h-4 w-4 rounded-full bg-[#FF5722]/20 text-[#FF5722] flex items-center justify-center text-[10px]">
              <Loader2 size={10} className="animate-spin" />
            </span>
          ) : (
            <span className="h-4 w-4 rounded-full border border-white/20 flex items-center justify-center text-[10px] text-white/40">
              ○
            </span>
          )}
        </div>

        <div className="truncate">
          <span className="font-mono text-xs font-semibold tracking-tight text-[#F4F4F6]">
            {node.label}
          </span>
          <p className="text-[10px] font-mono text-[#888B96] truncate">
            {node.agent}
          </p>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span className="text-[10px] font-mono text-[#5A5D68] group-hover:text-[#888B96]">
          {node.files.length} file{node.files.length === 1 ? "" : "s"}
        </span>
      </div>
    </motion.button>
  );
}
