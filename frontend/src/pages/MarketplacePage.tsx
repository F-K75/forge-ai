import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Star,
  Download,
  Search,
  Sparkles,
  Layers,
  ArrowUpRight,
  Plus,
  Check,
  Copy,
  Tag,
  ShieldCheck,
  Terminal,
  Grid,
  List,
  Flame,
  FileCode2,
  Cpu,
  Zap,
  Globe,
  X,
  Bookmark,
  Send,
  Boxes,
  type LucideIcon
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import BrandLogo from "../components/BrandLogo";
import { LIVE_MODE } from "../lib/env";
import { marketplaceApi } from "../lib/api";
import { atmosphereSwatch } from "../lib/coverArt";
import { COLORS } from "../lib/theme";

export type TemplateCategory =
  | "all"
  | "ai"
  | "saas"
  | "realtime"
  | "admin"
  | "ecommerce"
  | "analytics"
  | "devops";

export interface ExtendedTemplate {
  id: string;
  name: string;
  author: string;
  source: "official" | "community";
  category: TemplateCategory;
  description: string;
  tags: string[];
  rating: number;
  ratingCount: number;
  installs: string;
  installsNum: number;
  hue: string;
  prompt: string;
  version: string;
  lastUpdated: string;
  featured?: boolean;
  // Live mode: a curated starter that ships with the app (installs straight
  // from its prompt; it has no marketplace stats).
  builtIn?: boolean;
  // Live mode: whether `rating` came from the API (otherwise don't show one).
  ratingKnown?: boolean;
  architecture?: {
    frontend: string;
    backend: string;
    database: string;
    auth: string;
    aiEngine?: string;
  };
  filesList: string[];
}

const CATEGORIES: { id: TemplateCategory; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "All Blueprints", icon: Boxes },
  { id: "ai", label: "AI & Agents", icon: Cpu },
  { id: "saas", label: "SaaS & Billing", icon: Zap },
  { id: "realtime", label: "Realtime & Sockets", icon: Flame },
  { id: "admin", label: "Enterprise Admin", icon: ShieldCheck },
  { id: "ecommerce", label: "E-Commerce", icon: Globe },
  { id: "analytics", label: "Analytics & Charts", icon: Layers },
  { id: "devops", label: "DevOps & Infra", icon: Terminal },
];

const INITIAL_TEMPLATES: ExtendedTemplate[] = [
  {
    id: "tpl-000",
    name: "Gemini 2.5 Multi-Agent Fleet",
    author: "Forge Core",
    source: "official",
    category: "ai",
    description: "Frontier multi-agent autonomous engineering pipeline with Gemini 2.5 Pro & Flash, parallel AST diffing, and automated QA healing.",
    tags: ["gemini-2.5", "agents", "autonomous", "ast-diff"],
    rating: 4.9,
    ratingCount: 312,
    installs: "4.8k",
    installsNum: 4820,
    hue: "#FACC15",
    version: "v2.4.0",
    lastUpdated: "2h ago",
    featured: true,
    prompt: "Build an autonomous software engineering pipeline powered by Gemini 2.5 Pro with parallel streaming worker agents (Architect, Developer, QA), token budget guardrails, and AST rollback verification.",
    architecture: {
      frontend: "React 19 + Tailwind CSS",
      backend: "Node.js / Hono Stream Gateway",
      database: "Cloud SQL PostgreSQL + Drizzle",
      auth: "Firebase Auth + Workload Identity",
      aiEngine: "Gemini 2.5 Pro & Flash (SDK v1.0)"
    },
    filesList: [
      "src/services/orchestrator.ts",
      "src/agents/architect.ts",
      "src/agents/developer.ts",
      "src/agents/qaSpecialist.ts",
      "src/config/agentFleet.json"
    ]
  },
  {
    id: "tpl-001",
    name: "Stripe SaaS Subscription Engine",
    author: "Forge Team",
    source: "official",
    category: "saas",
    description: "Full-stack SaaS starter with Stripe Billing, recurring subscriptions, customer portal, webhook verification, and tiered quotas.",
    tags: ["saas", "stripe", "billing", "subscriptions"],
    rating: 4.9,
    ratingCount: 248,
    installs: "3.9k",
    installsNum: 3940,
    hue: "#6366F1",
    version: "v3.1.2",
    lastUpdated: "1d ago",
    featured: true,
    prompt: "Create a complete SaaS billing engine with tiered pricing cards, Stripe Checkout session integration, webhook signature verification, and automated customer self-service portal.",
    architecture: {
      frontend: "React 19 + Tailwind CSS",
      backend: "Node.js Express / Stripe Node SDK",
      database: "PostgreSQL with Stripe Customer ID mappings",
      auth: "Cookie Session + JWT",
      aiEngine: "None (Deterministic Payment Logic)"
    },
    filesList: [
      "src/pages/PricingPage.tsx",
      "src/api/stripeCheckout.ts",
      "src/api/stripeWebhook.ts",
      "src/store/subscriptionStore.ts"
    ]
  },
  {
    id: "tpl-002",
    name: "Realtime Collaborative Canvas",
    author: "devhaus",
    source: "community",
    category: "realtime",
    description: "WebSocket-powered multi-user canvas with live presence cursors, conflict-free state syncing, and high-DPI vector export.",
    tags: ["canvas", "websockets", "realtime", "multiplayer"],
    rating: 4.8,
    ratingCount: 184,
    installs: "2.1k",
    installsNum: 2150,
    hue: "#22D3EE",
    version: "v1.8.0",
    lastUpdated: "3d ago",
    prompt: "Develop a realtime multiplayer collaborative whiteboard with multi-user cursor tracking, optimistic updates over WebSockets, and SVG/PNG vector export.",
    architecture: {
      frontend: "HTML5 Canvas + React + Konva",
      backend: "FastAPI / WebSocket Server",
      database: "Redis In-Memory State Cache",
      auth: "Anonymous / Ephemeral Session Token"
    },
    filesList: [
      "src/components/Whiteboard.tsx",
      "src/lib/socketClient.ts",
      "src/utils/canvasRender.ts",
      "src/hooks/usePresence.ts"
    ]
  },
  {
    id: "tpl-003",
    name: "Enterprise Admin & RBAC Audit Hub",
    author: "Forge Team",
    source: "official",
    category: "admin",
    description: "SOC2-compliant management dashboard with granular role-based access control, cryptographic audit trails, and bulk CSV export.",
    tags: ["admin", "rbac", "soc2", "audit-logs"],
    rating: 4.8,
    ratingCount: 290,
    installs: "3.8k",
    installsNum: 3820,
    hue: "#A855F7",
    version: "v2.0.1",
    lastUpdated: "4d ago",
    prompt: "Build an enterprise administrative dashboard featuring role-based access control (RBAC), immutable audit logging, and paginated data tables with CSV export and role delegation.",
    architecture: {
      frontend: "React + TanStack Table + Tailwind",
      backend: "Python FastAPI / Pydantic V2",
      database: "Cloud SQL PostgreSQL",
      auth: "OIDC / SAML SSO Gateway"
    },
    filesList: [
      "src/pages/AdminConsole.tsx",
      "src/components/AuditTable.tsx",
      "src/middleware/rbacGuard.ts",
      "src/api/auditExport.ts"
    ]
  },
  {
    id: "tpl-004",
    name: "E-Commerce Storefront & Cart",
    author: "pixelcraft",
    source: "community",
    category: "ecommerce",
    description: "Product catalogue, faceted category filter, responsive slide-out cart, checkout flow, and inventory management.",
    tags: ["ecommerce", "catalog", "stripe", "cart"],
    rating: 4.7,
    ratingCount: 162,
    installs: "1.9k",
    installsNum: 1930,
    hue: "#F59E0B",
    version: "v1.4.0",
    lastUpdated: "5d ago",
    prompt: "Build a modern e-commerce storefront with product filtering by category and price, cart drawer, instant checkout flow with Stripe, and order inventory tracking.",
    architecture: {
      frontend: "React 19 + Tailwind CSS",
      backend: "Node.js REST API",
      database: "PostgreSQL (Products, Inventory, Orders)",
      auth: "Guest checkout + Optional Email Magic Link"
    },
    filesList: [
      "src/pages/StoreCatalog.tsx",
      "src/components/CartDrawer.tsx",
      "src/services/productApi.ts",
      "src/store/cartStore.ts"
    ]
  },
  {
    id: "tpl-005",
    name: "FinTech Streaming Analytics Dash",
    author: "chartsmith",
    source: "community",
    category: "analytics",
    description: "Low-latency streaming market analytics dashboard with Recharts time-series data, Bollinger bands, and portfolio risk telemetry.",
    tags: ["analytics", "recharts", "fintech", "time-series"],
    rating: 4.6,
    ratingCount: 140,
    installs: "1.4k",
    installsNum: 1420,
    hue: "#34D399",
    version: "v1.2.0",
    lastUpdated: "1w ago",
    prompt: "Create a financial analytics platform with live streaming chart visualizers, custom date range selectors, Bollinger band computation, and asset allocation breakdown.",
    architecture: {
      frontend: "React + Recharts + D3-scale",
      backend: "FastAPI Streaming SSE Server",
      database: "TimescaleDB Time-Series Engine",
      auth: "API Key Bearer Token"
    },
    filesList: [
      "src/components/TimeSeriesChart.tsx",
      "src/lib/financialMath.ts",
      "src/pages/PortfolioAnalytics.tsx",
      "src/hooks/useMarketFeed.ts"
    ]
  },
  {
    id: "tpl-006",
    name: "Autonomous RAG Knowledge Base",
    author: "Forge Team",
    source: "official",
    category: "ai",
    description: "Vector semantic retrieval search engine with document chunking, embeddings pipeline, and interactive source citation grounding.",
    tags: ["rag", "vector-db", "gemini", "knowledge-base"],
    rating: 4.9,
    ratingCount: 205,
    installs: "2.7k",
    installsNum: 2710,
    hue: "#EC4899",
    version: "v2.1.0",
    lastUpdated: "1w ago",
    featured: true,
    prompt: "Implement a Retrieval-Augmented Generation (RAG) assistant with semantic PDF search, markdown rendering, and interactive source citations grounded in user documents.",
    architecture: {
      frontend: "React + Lucide + Markdown Viewer",
      backend: "Python LangChain / FastAPI",
      database: "pgvector PostgreSQL Embeddings",
      auth: "Firebase Auth",
      aiEngine: "Gemini Embeddings + Gemini 2.5 Flash"
    },
    filesList: [
      "src/services/ragEngine.ts",
      "src/components/CitationList.tsx",
      "src/pages/DocSearch.tsx",
      "src/lib/vectorClient.ts"
    ]
  },
  {
    id: "tpl-007",
    name: "Cloud Container DevOps Fleet",
    author: "cloudops",
    source: "community",
    category: "devops",
    description: "Cloud Run container lifecycle manager with zero-downtime blue/green rollouts, health probes, and live streaming logs terminal.",
    tags: ["devops", "cloud-run", "containers", "ci-cd"],
    rating: 4.7,
    ratingCount: 98,
    installs: "1.2k",
    installsNum: 1210,
    hue: "#3B82F6",
    version: "v1.1.0",
    lastUpdated: "2w ago",
    prompt: "Build a cloud container management UI with live replica scaling, container health checks, and streaming stdout/stderr terminal interface.",
    architecture: {
      frontend: "React + Xterm.js Terminal + Tailwind",
      backend: "Node.js GCP Cloud Run Client API",
      database: "Firestore State Store",
      auth: "Google Cloud IAM Workload Identity"
    },
    filesList: [
      "src/components/PodStatus.tsx",
      "src/services/cloudRun.ts",
      "src/pages/Deployments.tsx",
      "src/components/LiveLogTerminal.tsx"
    ]
  }
];

export default function MarketplacePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "official" | "community">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "rating" | "newest">("popular");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Local templates catalog
  // Live mode: the bundled "community" entries and every bundled rating /
  // install count are sample data. Keep only the official starters (as
  // built-in prompts) and add the real community templates from the API.
  const builtInTemplates = useMemo(
    () =>
      INITIAL_TEMPLATES.filter((t) => t.source === "official").map((t) => ({ ...t, builtIn: true })),
    []
  );
  const [templates, setTemplates] = useState<ExtendedTemplate[]>(
    LIVE_MODE ? builtInTemplates : INITIAL_TEMPLATES
  );

  // Bookmarks / Stars stored in local state
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("forge_marketplace_bookmarks");
      return saved ? JSON.parse(saved) : ["tpl-000", "tpl-001"];
    } catch {
      return ["tpl-000", "tpl-001"];
    }
  });

  // Modal states
  const [selectedTemplate, setSelectedTemplate] = useState<ExtendedTemplate | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Publish Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<TemplateCategory>("ai");
  const [newDescription, setNewDescription] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newAuthor, setNewAuthor] = useState("Community Developer");

  // Fetch from live backend if LIVE_MODE
  useEffect(() => {
    if (!LIVE_MODE) return;
    marketplaceApi
      .list({ search: search.trim() || undefined })
      .then((items: any[]) => {
        const mapped: ExtendedTemplate[] = (items ?? []).map((item: any) => {
          const downloads: number = typeof item.downloads === "number" ? item.downloads : 0;
          const hasRating = typeof item.rating === "number";
          return {
            id: item.id,
            name: item.title,
            author: item.author_name || "Community",
            source: "community" as const,
            category: "ai" as const,
            description: item.description || "",
            tags: item.tags || [],
            rating: hasRating ? Math.round(item.rating * 10) / 10 : 0,
            ratingKnown: hasRating,
            ratingCount: typeof item.rating_count === "number" ? item.rating_count : 0,
            installs: downloads >= 1000 ? `${(downloads / 1000).toFixed(1)}k` : String(downloads),
            installsNum: downloads,
            hue: "#FACC15",
            version: item.version || "v1.0.0",
            lastUpdated: "—",
            prompt: item.prompt || "",
            filesList: [],
          };
        });
        setTemplates([...builtInTemplates, ...mapped]);
      })
      .catch(() => {
        // Community listings unavailable: the built-in starters still work.
        setTemplates(builtInTemplates);
      });
  }, [search, builtInTemplates]);

  // Toggle bookmark
  const toggleBookmark = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setBookmarkedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem("forge_marketplace_bookmarks", JSON.stringify(next));
      } catch {
        // ignore
      }
      toast.success(exists ? "Removed from saved starters" : "Added to saved starters");
      return next;
    });
  };

  // Filtered & Sorted items
  const filteredTemplates = useMemo(() => {
    return templates
      .filter((tpl) => {
        const matchCategory =
          selectedCategory === "all" || tpl.category === selectedCategory;

        const matchSource =
          sourceFilter === "all" || tpl.source === sourceFilter;

        const q = search.trim().toLowerCase();
        const matchSearch =
          !q ||
          tpl.name.toLowerCase().includes(q) ||
          tpl.description.toLowerCase().includes(q) ||
          tpl.author.toLowerCase().includes(q) ||
          tpl.tags.some((tag) => tag.toLowerCase().includes(q));

        return matchCategory && matchSource && matchSearch;
      })
      .sort((a, b) => {
        if (sortBy === "popular") return b.installsNum - a.installsNum;
        if (sortBy === "rating") return b.rating - a.rating;
        return a.name.localeCompare(b.name);
      });
  }, [templates, selectedCategory, sourceFilter, search, sortBy]);

  // Install starter -> triggers workspace launch with prompt prefilled
  const handleInstall = async (template: ExtendedTemplate, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tId = toast.loading(`Scaffolding ${template.name}...`);
    try {
      if (LIVE_MODE && template.builtIn) {
        toast.success(`Loaded starter: ${template.name}`, { id: tId });
        navigate("/build/new", { state: { prompt: template.prompt } });
      } else if (LIVE_MODE) {
        const res = await marketplaceApi.download(template.id);
        toast.success(`Loaded starter: ${template.name}`, { id: tId });
        navigate("/build/new", { state: { prompt: res.prompt || template.prompt } });
      } else {
        setTimeout(() => {
          toast.success(`Starter loaded: ${template.name}`, { id: tId });
          navigate("/build/new", { state: { prompt: template.prompt } });
        }, 600);
      }
    } catch {
      toast.error("Couldn't initialize starter template", { id: tId });
    }
  };

  // Copy Prompt
  const handleCopyPrompt = (prompt: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    toast.success("Copied blueprint prompt to clipboard");
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Open Details Modal
  const handleOpenDetails = (template: ExtendedTemplate) => {
    setSelectedTemplate(template);
    setDetailsModalOpen(true);
  };

  // Publish Starter
  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrompt.trim() || !newDescription.trim()) {
      toast.error("Please fill in the title, description, and prompt");
      return;
    }

    const tagsArray = newTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const newTpl: ExtendedTemplate = {
      id: `tpl-${Date.now().toString(36)}`,
      name: newTitle.trim(),
      author: newAuthor.trim() || "Community Member",
      source: "community",
      category: newCategory,
      description: newDescription.trim(),
      tags: tagsArray.length > 0 ? tagsArray : ["community", "starter"],
      rating: 5.0,
      ratingCount: 1,
      installs: "1",
      installsNum: 1,
      hue: "#2DD4BF",
      version: "v1.0.0",
      lastUpdated: "Just now",
      prompt: newPrompt.trim(),
      architecture: {
        frontend: "React 19 + Tailwind",
        backend: "Node.js / Express",
        database: "PostgreSQL",
        auth: "Firebase Auth"
      },
      filesList: ["src/App.tsx", "src/main.tsx", "src/styles/globals.css"]
    };

    if (LIVE_MODE) {
      try {
        await marketplaceApi.create({
          title: newTpl.name,
          description: newTpl.description,
          prompt: newTpl.prompt,
          tags: newTpl.tags,
          is_public: true
        });
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        toast.error(typeof detail === "string" ? detail : "Couldn't publish the starter.");
        return;
      }
    }

    setTemplates((prev) => [newTpl, ...prev]);
    setPublishModalOpen(false);
    setNewTitle("");
    setNewDescription("");
    setNewPrompt("");
    setNewTags("");
    toast.success(`Published starter: ${newTpl.name}`);
  };

  // Total metrics
  const totalInstallsCount = useMemo(() => {
    // Built-in starters carry sample install counts; only real downloads count.
    return templates.reduce((acc, t) => acc + (LIVE_MODE && t.builtIn ? 0 : t.installsNum), 0);
  }, [templates]);

  return (
    <motion.div
      className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-7"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* 1. Header Section */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandLogo size="md" />
              <h1 className="text-headline font-medium tracking-tight text-ink">
                Marketplace &amp; starters.{" "}
                <span className="text-muted">Blueprints that ship.</span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill border border-transparent bg-accent/[0.12] text-accent text-xs font-medium">
                <Sparkles size={12} />
                Verified Starters
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Pre-built architectural foundations, multi-agent frameworks, and SaaS blueprints for instant workspace scaffolding.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPublishModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill border border-border bg-ink text-on-ink text-xs font-medium hover:bg-ink/90 transition-all"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Publish Starter</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill border border-glass-border bg-glass text-ink text-xs font-medium hover:bg-ink/10 transition-all "
            >
              <span>Active Workspace</span>
              <ArrowUpRight size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 2. Telemetry KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Curated Blueprints */}
          <div className="relative overflow-hidden border border-border bg-panel p-3 transition-all">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-brutal-cyan text-ink">
                <Boxes size={14} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-lg font-semibold leading-none text-ink">
                  {templates.length} <span className="text-[11px] font-normal text-muted">starters</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Total Starters
                </div>
              </div>
            </div>
          </div>

          {/* Total Installs */}
          <div className="relative overflow-hidden border border-border bg-panel p-3 transition-all">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-brutal-green text-ink">
                <Download size={14} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-lg font-semibold leading-none text-ink">
                  {LIVE_MODE ? totalInstallsCount.toLocaleString() : `${(totalInstallsCount / 1000).toFixed(1)}k+`}{" "}
                  <span className="text-[11px] font-normal text-muted">{LIVE_MODE ? "downloads" : "runs"}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Deployments
                </div>
              </div>
            </div>
          </div>

          {/* Quality Score */}
          <div className="relative overflow-hidden border border-border bg-panel p-3 transition-all">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-transparent bg-accent/[0.12] text-accent">
                <Star size={14} strokeWidth={2.5} className="fill-ink text-ink" />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-lg font-semibold leading-none text-ink">
                  4.8 <span className="text-[11px] font-normal text-muted">/ 5.0</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Avg Rating
                </div>
              </div>
            </div>
          </div>

          {/* Frontier Engines */}
          <div className="relative overflow-hidden border border-border bg-panel p-3 transition-all">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-brutal-pink text-ink">
                <Cpu size={14} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-lg font-semibold leading-none text-ink truncate">
                  Gemini 2.5
                </div>
                <div className="mt-1 truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Multi-Agent Ready
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. Filter, Search & View Bar */}
      <section className="border border-border bg-panel p-4 space-y-3.5">
        {/* Category Pills Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono font-semibold">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill border transition shrink-0 text-[11px] ${
                  isSelected
                    ? "bg-accent/[0.12] text-accent border-transparent font-semibold"
                    : "bg-panel text-muted border-border hover:border-border hover:text-ink font-semibold"
                }`}
              >
                <Icon size={13} strokeWidth={2.2} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search, Source Filter & Sorting Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2 border-t-2 border-border">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search starters, tags, stacks..."
              className="w-full bg-panel text-xs font-semibold font-mono text-ink placeholder-muted/60 pl-9 pr-7 py-2 rounded-lg border border-border focus:outline-none focus:border-accent/50 "
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Right Filters */}
          <div className="flex flex-wrap items-center justify-between md:justify-end w-full md:w-auto gap-2.5">
            {/* Source tabs */}
            <div className="flex items-center rounded-lg border border-border bg-panel-alt p-0.5 text-xs font-mono font-semibold">
              {(["all", "official", "community"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setSourceFilter(source)}
                  className={`px-2.5 py-1 transition text-[10px] ${
                    sourceFilter === source
                      ? "bg-panel text-ink border border-border font-semibold"
                      : "text-muted hover:text-ink font-semibold"
                  }`}
                >
                  {source}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-muted">
              <span className="uppercase text-[10px]">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-panel text-xs font-mono font-semibold text-ink border border-border rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value="popular">Most Installed</option>
                <option value="rating">Highest Rated</option>
                <option value="newest">Alphabetical</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border bg-panel p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 transition ${
                  viewMode === "grid"
                    ? "bg-accent/[0.12] text-accent border border-transparent"
                    : "text-muted hover:text-ink"
                }`}
                title="Grid view"
              >
                <Grid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition ${
                  viewMode === "list"
                    ? "bg-accent/[0.12] text-accent border border-transparent"
                    : "text-muted hover:text-ink"
                }`}
                title="List view"
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Starter Templates Catalog (Grid or List View) */}
      {filteredTemplates.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map((template) => {
              const isBookmarked = bookmarkedIds.includes(template.id);
              return (
                <div
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenDetails(template)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenDetails(template);
                    }
                  }}
                  className="group relative flex flex-col justify-between rounded-xl border border-border bg-panel p-5 hover:border-ink/20 transition-all cursor-pointer"
                >
                  {/* Card Header */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center font-mono font-semibold text-base text-ink"
                          style={{ background: atmosphereSwatch(template.id), color: COLORS.ink }}
                        >
                          {template.name[0]}
                        </div>
                        <div>
                          <h3 className=" text-sm sm:text-base font-semibold text-ink line-clamp-1 group-hover:text-warn transition">
                            {template.name}
                          </h3>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-muted">
                            <span>{template.author}</span>
                            <span>•</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-pill border border-border bg-panel-alt font-semibold uppercase text-ink">
                              {template.source}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bookmark button */}
                      <button
                        type="button"
                        onClick={(e) => toggleBookmark(template.id, e)}
                        className={`p-1.5 rounded-lg border border-border transition ${
                          isBookmarked
                            ? "bg-accent/[0.12] text-accent"
                            : "bg-panel text-muted hover:text-ink"
                        }`}
                        title={isBookmarked ? "Saved" : "Save blueprint"}
                      >
                        <Bookmark
                          size={13}
                          className={isBookmarked ? "fill-ink" : ""}
                        />
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted leading-relaxed line-clamp-2">
                      {template.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {template.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold rounded-pill border border-border bg-panel-alt text-ink"
                        >
                          <Tag size={9} className="text-muted" />
                          {tag}
                        </span>
                      ))}
                      {template.tags.length > 3 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono text-muted">
                          +{template.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-5 pt-3.5 border-t-2 border-border flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs font-mono font-semibold">
                      {LIVE_MODE && template.builtIn ? (
                        <span className="text-muted uppercase text-[10px]">Built-in starter</span>
                      ) : (
                        <>
                          {(!LIVE_MODE || template.ratingKnown) && (
                            <span className="flex items-center gap-1 text-ink">
                              <Star size={12} className="fill-brutal-yellow text-ink dark:text-brutal-yellow" />
                              {template.rating}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-muted">
                            <Download size={12} />
                            {template.installs}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetails(template);
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-ink/5 transition"
                      >
                        Inspect
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleInstall(template, e)}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-pill border border-glass-border bg-glass text-ink hover:bg-ink/10 transition-all"
                      >
                        <span>Deploy</span>
                        <ArrowUpRight size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="rounded-lg border border-border bg-panel overflow-hidden divide-y-2 divide-border">
            {filteredTemplates.map((template) => {
              const isBookmarked = bookmarkedIds.includes(template.id);
              return (
                <div
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenDetails(template)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenDetails(template);
                    }
                  }}
                  className="group flex flex-col md:flex-row md:items-center justify-between p-4 hover:bg-ink/5 transition cursor-pointer gap-4"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div
                      className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center font-mono font-semibold text-base text-ink"
                      style={{ background: atmosphereSwatch(template.id), color: COLORS.ink }}
                    >
                      {template.name[0]}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className=" text-sm sm:text-base font-semibold text-ink truncate group-hover:text-warn transition">
                          {template.name}
                        </h3>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-pill border border-border bg-panel-alt font-semibold uppercase text-muted">
                          {template.source}
                        </span>
                        {template.featured && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-pill border border-transparent bg-accent/[0.12] font-semibold uppercase text-accent">
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted line-clamp-1 max-w-2xl">
                        {template.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {template.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded-pill bg-panel-alt text-muted border border-border"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* List Row Right Stats & Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                    <div className="flex items-center gap-3 text-xs font-mono font-semibold">
                      {LIVE_MODE && template.builtIn ? (
                        <span className="text-muted uppercase text-[10px]">Built-in starter</span>
                      ) : (
                        <>
                          {(!LIVE_MODE || template.ratingKnown) && (
                            <span className="flex items-center gap-1 text-ink">
                              <Star size={12} className="fill-brutal-yellow text-ink dark:text-brutal-yellow" />
                              {template.rating}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-muted">
                            <Download size={12} />
                            {template.installs}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => toggleBookmark(template.id, e)}
                        className={`p-1.5 rounded-lg border border-border transition ${
                          isBookmarked
                            ? "bg-accent/[0.12] text-accent"
                            : "bg-panel text-muted hover:text-ink"
                        }`}
                        title={isBookmarked ? "Saved" : "Save blueprint"}
                      >
                        <Bookmark
                          size={13}
                          className={isBookmarked ? "fill-ink" : ""}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleInstall(template, e)}
                        className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium rounded-pill border border-glass-border bg-glass text-ink hover:bg-ink/10 transition-all"
                      >
                        <span>Deploy</span>
                        <ArrowUpRight size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Empty State */
        <div className="rounded-xl border border-border bg-panel p-12 text-center space-y-3">
          <div className="h-12 w-12 mx-auto rounded-lg border border-border bg-ink/[0.06] flex items-center justify-center font-mono font-semibold text-xl text-ink">
            !
          </div>
          <h3 className=" text-base font-semibold text-ink">
            No starters found matching your filters
          </h3>
          <p className="text-xs text-muted max-w-md mx-auto">
            Try adjusting your search terms, changing the category pill, or clearing the query to explore the full library.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSelectedCategory("all");
              setSourceFilter("all");
            }}
            className="px-4 py-2 text-xs font-medium rounded-pill border border-border bg-ink text-on-ink hover:bg-ink/90 transition"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* 5. Starter Details & Architecture Modal */}
      <AnimatePresence>
        {detailsModalOpen && selectedTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-base/70 backdrop-blur-xs">
            <motion.div
              className="w-full max-w-2xl max-h-[90vh] rounded-lg border-3 border-border bg-panel overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Modal Header */}
              <div
                className="flex items-center justify-between p-4 border-b-2 border-border"
                style={{ backgroundColor: selectedTemplate.hue }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg border border-border bg-panel flex items-center justify-center font-mono font-semibold text-base text-ink">
                    {selectedTemplate.name[0]}
                  </div>
                  <div>
                    <h2 className=" font-semibold text-base text-ink">
                      {selectedTemplate.name}
                    </h2>
                    <p className="text-xs text-ink font-semibold">
                      by {selectedTemplate.author} • {selectedTemplate.version}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  className="p-1 rounded-lg border border-border bg-panel text-ink hover:bg-ink/5"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              {/* Modal Scrollable Body */}
              <div className="p-5 overflow-y-auto space-y-5 flex-1">
                {/* Description */}
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted tracking-wider mb-1">
                    Overview
                  </h4>
                  <p className="text-xs sm:text-sm text-ink leading-relaxed">
                    {selectedTemplate.description}
                  </p>
                </div>

                {/* Architecture & Stack Matrix */}
                {selectedTemplate.architecture && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted tracking-wider">
                    Architectural Specifications
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-xs">
                    <div className="p-2.5 rounded-lg border border-border bg-panel">
                      <span className="text-muted block text-[10px] uppercase font-semibold">Frontend UI</span>
                      <span className="font-semibold text-ink">
                        {selectedTemplate.architecture!.frontend}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-border bg-panel">
                      <span className="text-muted block text-[10px] uppercase font-semibold">Backend Server</span>
                      <span className="font-semibold text-ink">
                        {selectedTemplate.architecture!.backend}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-border bg-panel">
                      <span className="text-muted block text-[10px] uppercase font-semibold">Database / State</span>
                      <span className="font-semibold text-ink">
                        {selectedTemplate.architecture!.database}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg border border-border bg-panel">
                      <span className="text-muted block text-[10px] uppercase font-semibold">Authentication</span>
                      <span className="font-semibold text-ink">
                        {selectedTemplate.architecture!.auth}
                      </span>
                    </div>
                    {selectedTemplate.architecture!.aiEngine && (
                      <div className="p-2.5 rounded-lg border border-transparent bg-accent/[0.12] sm:col-span-2">
                        <span className="text-ink block text-[10px] font-semibold uppercase">Autonomous AI Engine</span>
                        <span className="font-semibold text-ink">
                          {selectedTemplate.architecture!.aiEngine}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* File Manifest */}
                {selectedTemplate.filesList.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted tracking-wider">
                    Included File Manifest
                  </h4>
                  <div className="rounded-lg border border-border bg-panel p-2.5 font-mono text-xs space-y-1">
                    {selectedTemplate.filesList.map((file) => (
                      <div key={file} className="flex items-center gap-2 text-ink font-semibold">
                        <FileCode2 size={13} className="text-ink" />
                        <span>{file}</span>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {/* System Prompt Blueprint with Copy */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase text-muted tracking-wider">
                      Synthesis Prompt Blueprint
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(selectedTemplate.prompt)}
                      className="flex items-center gap-1 text-[11px] font-mono font-semibold uppercase text-ink hover:text-warn"
                    >
                      {copiedPrompt ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
                      <span>{copiedPrompt ? "Copied" : "Copy Prompt"}</span>
                    </button>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-panel-alt font-mono text-xs text-ink whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {selectedTemplate.prompt}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t-2 border-border bg-panel-alt flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs font-mono font-semibold text-muted">
                  {LIVE_MODE && selectedTemplate.builtIn ? (
                    <span>Built-in starter</span>
                  ) : (
                    <>
                      {(!LIVE_MODE || selectedTemplate.ratingKnown) && (
                        <>
                          <span className="flex items-center gap-1 text-ink">
                            <Star size={13} className="fill-brutal-yellow text-ink dark:text-brutal-yellow" />
                            {selectedTemplate.rating} ({selectedTemplate.ratingCount} reviews)
                          </span>
                          <span>•</span>
                        </>
                      )}
                      <span>{selectedTemplate.installs} installs</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailsModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-ink/5 transition"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailsModalOpen(false);
                      handleInstall(selectedTemplate);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-pill border border-border bg-ink text-on-ink hover:bg-ink/90 transition-all"
                  >
                    <ArrowUpRight size={13} strokeWidth={2.5} />
                    <span>Scaffold Blueprint</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Publish Starter Modal */}
      <AnimatePresence>
        {publishModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-base/70 backdrop-blur-xs">
            <motion.div
              className="w-full max-w-lg rounded-lg border-3 border-border bg-panel overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b-2 border-transparent bg-accent/[0.12]">
                <div className="flex items-center gap-2 font-mono font-semibold text-sm text-ink uppercase">
                  <Plus size={16} strokeWidth={2.5} />
                  <span>Publish Community Starter</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPublishModalOpen(false)}
                  className="p-1 rounded-lg border border-border bg-panel text-ink hover:bg-ink/5"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handlePublishSubmit} className="p-5 space-y-4">
                <div className="space-y-1">
                  <label htmlFor="starter-title" className="font-mono text-xs font-semibold uppercase text-muted">
                    Starter Title
                  </label>
                  <input
                    id="starter-title"
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Next.js SaaS with LemonSqueezy"
                    className="w-full bg-panel text-xs font-mono font-semibold text-ink p-2.5 rounded-lg border border-border focus:outline-none focus:border-accent/50 "
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="starter-category" className="font-mono text-xs font-semibold uppercase text-muted">
                      Category
                    </label>
                    <select
                      id="starter-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
                      className="w-full bg-panel text-xs font-mono font-semibold text-ink p-2.5 rounded-lg border border-border focus:outline-none "
                    >
                      <option value="ai">AI &amp; Agents</option>
                      <option value="saas">SaaS &amp; Billing</option>
                      <option value="realtime">Realtime &amp; Sockets</option>
                      <option value="admin">Enterprise Admin</option>
                      <option value="ecommerce">E-Commerce</option>
                      <option value="analytics">Analytics &amp; Charts</option>
                      <option value="devops">DevOps &amp; Infra</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="starter-author" className="font-mono text-xs font-semibold uppercase text-muted">
                      Author Handle
                    </label>
                    <input
                      id="starter-author"
                      type="text"
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      placeholder="e.g. devsmith"
                      className="w-full bg-panel text-xs font-mono font-semibold text-ink p-2.5 rounded-lg border border-border focus:outline-none "
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="starter-desc" className="font-mono text-xs font-semibold uppercase text-muted">
                    Summary Description
                  </label>
                  <textarea
                    id="starter-desc"
                    required
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Describe the architectural pattern and core features..."
                    className="w-full bg-panel text-xs font-mono text-ink p-2.5 rounded-lg border border-border focus:outline-none "
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="starter-tags" className="font-mono text-xs font-semibold uppercase text-muted">
                    Tags (comma separated)
                  </label>
                  <input
                    id="starter-tags"
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="e.g. saas, stripe, react, tailwind"
                    className="w-full bg-panel text-xs font-mono text-ink p-2.5 rounded-lg border border-border focus:outline-none "
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="starter-prompt" className="font-mono text-xs font-semibold uppercase text-muted">
                    Scaffolding Synthesis Prompt
                  </label>
                  <textarea
                    id="starter-prompt"
                    required
                    rows={3}
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="Detailed prompt that instructs the autonomous agent fleet how to build this stack..."
                    className="w-full bg-panel text-xs font-mono text-ink p-2.5 rounded-lg border border-border focus:outline-none focus:border-accent/50 "
                  />
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t-2 border-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPublishModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-ink/5 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-pill border border-border bg-ink text-on-ink hover:bg-ink/90 transition-all"
                  >
                    <Send size={13} strokeWidth={2.5} />
                    <span>Publish Starter</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
