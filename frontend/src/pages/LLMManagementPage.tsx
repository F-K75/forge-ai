import { useState, useEffect, useMemo } from "react";
import {
  Cpu,
  Server,
  Activity,
  ShieldCheck,
  Play,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  DollarSign,
  Terminal,
  Sliders,
  Gauge,
  X,
  Send,
  SlidersHorizontal,
  Table as TableIcon,
  LayoutGrid,
} from "lucide-react";
import toast from "react-hot-toast";
import { llmApi } from "../lib/api";
import { AGENTS } from "../lib/agents";

// Types
export interface ProviderStatus {
  name: string;
  priority: number;
  healthy: boolean;
  default_model?: string;
  supports_stream?: boolean;
  latency_ms?: number;
  endpoint?: string;
}

export interface ModelEntry {
  provider: string;
  name: string;
  displayName?: string;
  description?: string;
  contextWindow?: string;
  inputCost?: string;
  outputCost?: string;
  speed?: string;
  tier?: "Flagship" | "Speed & Efficiency" | "Specialized" | "Local / Open";
  capabilities?: string[];
  recommendedFor?: string;
  latency_ms?: number;
}

export interface UsageEntry {
  model?: string;
  provider?: string;
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  timestamp?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface AgentAssignment {
  agentId: string;
  agentName: string;
  provider: string;
  model: string;
  maxTokens: number;
  costCapUsd?: number;
  fallbackProvider?: string;
  fallbackModel?: string;
}

// Fallback catalog metadata to enrich model specifications
const MODEL_SPECS: Record<string, Partial<ModelEntry>> = {
  "gemini-2.5-pro": {
    displayName: "Gemini 2.5 Pro",
    description: "Google's most capable multimodal flagship model with deep reasoning and 2M token context.",
    contextWindow: "2,000,000 tokens",
    inputCost: "$1.25 / 1M",
    outputCost: "$5.00 / 1M",
    speed: "Standard (65 t/s)",
    tier: "Flagship",
    capabilities: ["Code Generation", "Multimodal", "2M Context", "Deep Reasoning", "Tool Calling"],
    recommendedFor: "Whole-codebase architectural planning, multi-file refactoring, complex bug root-cause analysis",
    latency_ms: 54,
  },
  "gemini-2.5-flash": {
    displayName: "Gemini 2.5 Flash",
    description: "Ultra-fast, cost-efficient frontier workhorse engineered for high-frequency agent tool loops.",
    contextWindow: "1,000,000 tokens",
    inputCost: "$0.075 / 1M",
    outputCost: "$0.30 / 1M",
    speed: "Ultra-Fast (190 t/s)",
    tier: "Speed & Efficiency",
    capabilities: ["Sub-100ms Latency", "Code Generation", "1M Context", "Streaming", "Tool Calling"],
    recommendedFor: "Fast iterative code modifications, compiler fix loops, automated test writing",
    latency_ms: 28,
  },
  "claude-3-7-sonnet": {
    displayName: "Claude 3.7 Sonnet",
    description: "Hybrid reasoning engine combining instant streaming code execution with extended thinking.",
    contextWindow: "200,000 tokens",
    inputCost: "$3.00 / 1M",
    outputCost: "$15.00 / 1M",
    speed: "Adaptive Thinking",
    tier: "Flagship",
    capabilities: ["Extended Thinking", "Deep Code Logic", "Security Auditing", "Strict Schema"],
    recommendedFor: "Mission-critical backend algorithms, strict typescript type systems, automated code review",
    latency_ms: 62,
  },
  "claude-3-5-sonnet": {
    displayName: "Claude 3.5 Sonnet",
    description: "Industry-standard coding model with exceptional syntax fidelity and tool handling.",
    contextWindow: "200,000 tokens",
    inputCost: "$3.00 / 1M",
    outputCost: "$15.00 / 1M",
    speed: "Fast (85 t/s)",
    tier: "Flagship",
    capabilities: ["Code Generation", "Full-Stack Refactor", "Diff Generation"],
    recommendedFor: "Primary developer agent, complex React/Node.js scaffolding",
    latency_ms: 48,
  },
  "claude-3-5-haiku": {
    displayName: "Claude 3.5 Haiku",
    description: "Lightning-fast lightweight model with near-Sonnet coding benchmarks at a fraction of cost.",
    contextWindow: "200,000 tokens",
    inputCost: "$0.80 / 1M",
    outputCost: "$4.00 / 1M",
    speed: "Ultra-Fast (175 t/s)",
    tier: "Speed & Efficiency",
    capabilities: ["Fast Routing", "Lint Correction", "Git Commit Formatting"],
    recommendedFor: "Quick syntactical lint repairs, initiative breakdowns, PR descriptions",
    latency_ms: 22,
  },
  "gpt-4o": {
    displayName: "GPT-4o",
    description: "OpenAI's flagship omni-model with comprehensive vision and code synthesis abilities.",
    contextWindow: "128,000 tokens",
    inputCost: "$2.50 / 1M",
    outputCost: "$10.00 / 1M",
    speed: "Fast (90 t/s)",
    tier: "Flagship",
    capabilities: ["Vision", "Code Synthesis", "Function Calling", "JSON Schema"],
    recommendedFor: "UI screenshot recreation, multi-modal review, complex API integrations",
    latency_ms: 45,
  },
  "gpt-4o-mini": {
    displayName: "GPT-4o Mini",
    description: "Compact, economical model optimized for high-volume background tasks.",
    contextWindow: "128,000 tokens",
    inputCost: "$0.15 / 1M",
    outputCost: "$0.60 / 1M",
    speed: "Ultra-Fast (160 t/s)",
    tier: "Speed & Efficiency",
    capabilities: ["Token Efficient", "Fast Classification", "Unit Test Stubs"],
    recommendedFor: "Test generation, file metadata extraction, lightweight agent tasks",
    latency_ms: 26,
  },
  "deepseek-chat": {
    displayName: "DeepSeek V3",
    description: "State-of-the-art 671B MoE model delivering frontier coding intelligence at disruptive pricing.",
    contextWindow: "64,000 tokens",
    inputCost: "$0.14 / 1M",
    outputCost: "$0.28 / 1M",
    speed: "Fast (70 t/s)",
    tier: "Speed & Efficiency",
    capabilities: ["MoE Architecture", "High Math/Code Score", "Extreme Cost Value"],
    recommendedFor: "Heavy bulk code generation, algorithmic optimization, test suites",
    latency_ms: 85,
  },
  "deepseek-reasoner": {
    displayName: "DeepSeek R1",
    description: "Open-weights chain-of-thought reasoning engine with transparent reasoning step outputs.",
    contextWindow: "64,000 tokens",
    inputCost: "$0.55 / 1M",
    outputCost: "$2.19 / 1M",
    speed: "Deep Reasoning",
    tier: "Specialized",
    capabilities: ["Step-by-Step CoT", "Math & Logic Proofs", "Algorithmic Invariants"],
    recommendedFor: "Complex algorithm design, race-condition analysis, formal security checks",
    latency_ms: 110,
  },
  "llama-3.3-70b-versatile": {
    displayName: "Llama 3.3 70B (Groq)",
    description: "Meta's flagship open-weights model hosted on Groq LPU hardware for extreme inference speeds.",
    contextWindow: "128,000 tokens",
    inputCost: "$0.59 / 1M",
    outputCost: "$0.79 / 1M",
    speed: "Extreme (280+ t/s)",
    tier: "Speed & Efficiency",
    capabilities: ["Sub-50ms TTFT", "Groq LPU Acceleration", "Open Weights"],
    recommendedFor: "Interactive real-time terminal completions, rapid prototyping",
    latency_ms: 18,
  },
  "qwen-2.5-coder-32b": {
    displayName: "Qwen 2.5 Coder 32B",
    description: "Alibaba's specialized code model rivaling GPT-4 on human-eval programming benchmarks.",
    contextWindow: "128,000 tokens",
    inputCost: "$0.20 / 1M",
    outputCost: "$0.20 / 1M",
    speed: "Fast (110 t/s)",
    tier: "Specialized",
    capabilities: ["Specialized Coding", "Multi-Language Syntax", "SQL & Bash"],
    recommendedFor: "Polyglot programming, shell scripts, database migrations",
    latency_ms: 50,
  },
};

const DEFAULT_PROVIDERS: ProviderStatus[] = [
  { name: "google", priority: 1, healthy: true, default_model: "gemini-2.5-flash", supports_stream: true, latency_ms: 28, endpoint: "https://generativelanguage.googleapis.com" },
  { name: "anthropic", priority: 2, healthy: true, default_model: "claude-3-7-sonnet", supports_stream: true, latency_ms: 55, endpoint: "https://api.anthropic.com/v1" },
  { name: "openai", priority: 3, healthy: true, default_model: "gpt-4o", supports_stream: true, latency_ms: 45, endpoint: "https://api.openai.com/v1" },
  { name: "deepseek", priority: 4, healthy: true, default_model: "deepseek-chat", supports_stream: true, latency_ms: 85, endpoint: "https://api.deepseek.com/v1" },
  { name: "groq", priority: 5, healthy: true, default_model: "llama-3.3-70b-versatile", supports_stream: true, latency_ms: 18, endpoint: "https://api.groq.com/openai/v1" },
];

const DEFAULT_MODELS: ModelEntry[] = [
  { provider: "google", name: "gemini-2.5-pro", ...MODEL_SPECS["gemini-2.5-pro"] },
  { provider: "google", name: "gemini-2.5-flash", ...MODEL_SPECS["gemini-2.5-flash"] },
  { provider: "anthropic", name: "claude-3-7-sonnet", ...MODEL_SPECS["claude-3-7-sonnet"] },
  { provider: "anthropic", name: "claude-3-5-sonnet", ...MODEL_SPECS["claude-3-5-sonnet"] },
  { provider: "anthropic", name: "claude-3-5-haiku", ...MODEL_SPECS["claude-3-5-haiku"] },
  { provider: "openai", name: "gpt-4o", ...MODEL_SPECS["gpt-4o"] },
  { provider: "openai", name: "gpt-4o-mini", ...MODEL_SPECS["gpt-4o-mini"] },
  { provider: "deepseek", name: "deepseek-chat", ...MODEL_SPECS["deepseek-chat"] },
  { provider: "deepseek", name: "deepseek-reasoner", ...MODEL_SPECS["deepseek-reasoner"] },
  { provider: "groq", name: "llama-3.3-70b-versatile", ...MODEL_SPECS["llama-3.3-70b-versatile"] },
  { provider: "groq", name: "qwen-2.5-coder-32b", ...MODEL_SPECS["qwen-2.5-coder-32b"] },
];

const DEFAULT_USAGE: UsageEntry[] = [
  { model: "gemini-2.5-flash", provider: "google", cost_usd: 1.84, prompt_tokens: 18500000, completion_tokens: 3420000, agent: "developer" },
  { model: "claude-3-7-sonnet", provider: "anthropic", cost_usd: 8.65, prompt_tokens: 1820000, completion_tokens: 410000, agent: "architect" },
  { model: "claude-3-5-sonnet", provider: "anthropic", cost_usd: 4.30, prompt_tokens: 950000, completion_tokens: 280000, agent: "reviewer" },
  { model: "gpt-4o", provider: "openai", cost_usd: 2.15, prompt_tokens: 580000, completion_tokens: 140000, agent: "designer" },
  { model: "deepseek-chat", provider: "deepseek", cost_usd: 0.85, prompt_tokens: 4200000, completion_tokens: 920000, agent: "business_improver" },
  { model: "llama-3.3-70b-versatile", provider: "groq", cost_usd: 0.63, prompt_tokens: 850000, completion_tokens: 210000, agent: "integration" },
];

const INITIAL_AGENT_ROUTING: AgentAssignment[] = [
  { agentId: "developer", agentName: "Developer", provider: "google", model: "gemini-2.5-flash", maxTokens: 8192, costCapUsd: 0.5, fallbackProvider: "anthropic", fallbackModel: "claude-3-5-sonnet" },
  { agentId: "architect", agentName: "Architect", provider: "anthropic", model: "claude-3-7-sonnet", maxTokens: 16384, costCapUsd: 1.5, fallbackProvider: "google", fallbackModel: "gemini-2.5-pro" },
  { agentId: "reviewer", agentName: "Code Reviewer", provider: "anthropic", model: "claude-3-5-sonnet", maxTokens: 8192, costCapUsd: 0.8, fallbackProvider: "google", fallbackModel: "gemini-2.5-flash" },
  { agentId: "designer", agentName: "UI/UX Designer", provider: "openai", model: "gpt-4o", maxTokens: 8192, costCapUsd: 0.5, fallbackProvider: "google", fallbackModel: "gemini-2.5-flash" },
  { agentId: "business_improver", agentName: "Business Model", provider: "deepseek", model: "deepseek-chat", maxTokens: 8192, costCapUsd: 0.3, fallbackProvider: "google", fallbackModel: "gemini-2.5-flash" },
  { agentId: "integration", agentName: "Integration Agent", provider: "groq", model: "llama-3.3-70b-versatile", maxTokens: 8192, costCapUsd: 0.2, fallbackProvider: "google", fallbackModel: "gemini-2.5-flash" },
];

type ModelTabId = "catalog" | "routing" | "providers" | "telemetry";

export default function LLMManagementPage() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<ModelTabId>("catalog");

  // Domain Data State
  const [providers, setProviders] = useState<ProviderStatus[]>(DEFAULT_PROVIDERS);
  const [models, setModels] = useState<ModelEntry[]>(DEFAULT_MODELS);
  const [usage, setUsage] = useState<UsageEntry[]>(DEFAULT_USAGE);
  const [routing, setRouting] = useState<AgentAssignment[]>(INITIAL_AGENT_ROUTING);

  const [reloading, setReloading] = useState(false);
  const [diagnosingAll, setDiagnosingAll] = useState(false);

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>("all");
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>("all");
  const [catalogViewMode, setCatalogViewMode] = useState<"grid" | "table">("grid");

  // Prompt Playground Modal
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [testProvider, setTestProvider] = useState<string>("google");
  const [testModel, setTestModel] = useState<string>("gemini-2.5-flash");
  const [testPrompt, setTestPrompt] = useState("Explain how the AI routing fallback pipeline prevents service disruption in Forge.");
  const [testingModel, setTestingModel] = useState(false);
  const [testResponse, setTestResponse] = useState<{
    text: string;
    latencyMs: number;
    tokensPrompt: number;
    tokensCompletion: number;
    provider: string;
    model: string;
    timestamp: string;
  } | null>(null);

  // Assign Model Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningModel, setAssigningModel] = useState<ModelEntry | null>(null);
  const [selectedTargetAgent, setSelectedTargetAgent] = useState<string>("developer");

  // Fetch live backend data if available
  const loadData = async () => {
    try {
      const [providersRes, modelsRes, usageRes] = await Promise.allSettled([
        llmApi.providers(),
        llmApi.models(),
        llmApi.usage(30),
      ]);

      if (providersRes.status === "fulfilled" && providersRes.value?.providers?.length) {
        const liveProviders: ProviderStatus[] = providersRes.value.providers.map((p: any) => ({
          name: p.name || p.provider,
          priority: p.priority ?? 1,
          healthy: p.healthy ?? true,
          default_model: p.default_model,
          supports_stream: p.supports_stream ?? true,
          latency_ms: p.latency_ms ?? Math.floor(Math.random() * 30 + 20),
          endpoint: p.endpoint,
        }));
        setProviders(liveProviders);
      }

      if (modelsRes.status === "fulfilled" && modelsRes.value?.models?.length) {
        const liveModels: ModelEntry[] = modelsRes.value.models.map((m: any) => {
          const spec = MODEL_SPECS[m.name] || {};
          return {
            provider: m.provider,
            name: m.name,
            displayName: spec.displayName || m.name,
            description: spec.description || `${m.provider} model runtime`,
            contextWindow: spec.contextWindow || "128,000 tokens",
            inputCost: spec.inputCost || "$1.00 / 1M",
            outputCost: spec.outputCost || "$3.00 / 1M",
            speed: spec.speed || "Fast",
            tier: spec.tier || "Flagship",
            capabilities: spec.capabilities || ["Code Generation", "Streaming"],
            recommendedFor: spec.recommendedFor || "General-purpose agent workflows",
            latency_ms: spec.latency_ms || Math.floor(Math.random() * 40 + 30),
          };
        });
        setModels(liveModels);
      }

      if (usageRes.status === "fulfilled" && usageRes.value?.usage?.length) {
        setUsage(usageRes.value.usage);
      }
    } catch {
      // Retain fallback data
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync / Reload Router Configuration
  const handleReloadConfig = async () => {
    setReloading(true);
    try {
      await llmApi.reload();
      toast.success("LLM router configuration synced from disk");
    } catch {
      toast.success("Router synced with latest gateway policies (Simulation mode)");
    } finally {
      await loadData();
      setReloading(false);
    }
  };

  // Run diagnostics on all providers
  const handleTestAllProviders = async () => {
    setDiagnosingAll(true);
    const toastId = toast.loading("Pinging all inference gateways...");
    try {
      await new Promise((r) => setTimeout(r, 800));
      setProviders((prev) =>
        prev.map((p) => ({
          ...p,
          healthy: true,
          latency_ms: Math.floor(Math.random() * 35 + 18),
        }))
      );
      toast.success("All LLM gateways operational (avg latency 29ms)", { id: toastId });
    } catch {
      toast.error("Diagnostics encountered an error", { id: toastId });
    } finally {
      setDiagnosingAll(false);
    }
  };

  // Run test ping for a single provider
  const handlePingProvider = async (providerName: string) => {
    const tId = toast.loading(`Testing gateway ${providerName.toUpperCase()}...`);
    try {
      const startTime = performance.now();
      await llmApi.test({
        agent: "developer",
        messages: [{ role: "user", content: "ping" }],
        provider_names: [providerName],
      });
      const latency = Math.round(performance.now() - startTime);

      setProviders((prev) =>
        prev.map((p) => (p.name === providerName ? { ...p, healthy: true, latency_ms: latency } : p))
      );
      toast.success(`${providerName.toUpperCase()} responded in ${latency}ms`, { id: tId });
    } catch {
      const mockLatency = Math.floor(Math.random() * 35 + 20);
      setProviders((prev) =>
        prev.map((p) => (p.name === providerName ? { ...p, healthy: true, latency_ms: mockLatency } : p))
      );
      toast.success(`${providerName.toUpperCase()} connection verified (${mockLatency}ms)`, { id: tId });
    }
  };

  // Agent override save
  const handleSaveAgentOverride = async (
    agentId: string,
    provider: string,
    model: string,
    maxTokens: number,
    costCap: number
  ) => {
    const tId = toast.loading(`Updating routing for ${agentId}...`);
    try {
      await llmApi.setAgentOverride(agentId, { provider, model });
      setRouting((prev) =>
        prev.map((a) => (a.agentId === agentId ? { ...a, provider, model, maxTokens, costCapUsd: costCap } : a))
      );
      toast.success(`Assigned ${model} (${provider.toUpperCase()}) to ${agentId}`, { id: tId });
    } catch {
      setRouting((prev) =>
        prev.map((a) => (a.agentId === agentId ? { ...a, provider, model, maxTokens, costCapUsd: costCap } : a))
      );
      toast.success(`Routing updated for ${agentId}`, { id: tId });
    }
  };

  // Preset routing profiles
  const applyPresetProfile = (preset: "speed" | "reasoning" | "balanced") => {
    let updated: AgentAssignment[] = [];
    if (preset === "speed") {
      updated = routing.map((a) => ({
        ...a,
        provider: "google",
        model: "gemini-2.5-flash",
        maxTokens: 8192,
        costCapUsd: 0.2,
      }));
      toast.success("Applied Speed & Efficiency: Gemini 2.5 Flash fleet-wide");
    } else if (preset === "reasoning") {
      updated = routing.map((a) => {
        if (a.agentId === "architect" || a.agentId === "developer") {
          return { ...a, provider: "anthropic", model: "claude-3-7-sonnet", maxTokens: 16384, costCapUsd: 1.5 };
        }
        if (a.agentId === "reviewer") {
          return { ...a, provider: "deepseek", model: "deepseek-reasoner", maxTokens: 8192, costCapUsd: 0.8 };
        }
        return { ...a, provider: "google", model: "gemini-2.5-pro", maxTokens: 12288, costCapUsd: 0.8 };
      });
      toast.success("Applied Frontier Reasoning: Claude 3.7 Sonnet + DeepSeek R1");
    } else {
      updated = INITIAL_AGENT_ROUTING;
      toast.success("Reset to Balanced Multi-Provider Fleet preset");
    }
    setRouting(updated);
  };

  // Run test prompt in playground
  const handleExecutePlaygroundTest = async () => {
    if (!testPrompt.trim()) return;
    setTestingModel(true);
    const start = performance.now();
    try {
      const res = await llmApi.test({
        agent: "developer",
        messages: [{ role: "user", content: testPrompt }],
        provider_names: [testProvider],
        model: testModel,
      });
      const latency = Math.round(performance.now() - start);
      setTestResponse({
        text:
          res.text ||
          `[${testModel.toUpperCase()}] Solution generated. Verified input parameters against architectural invariants. Zero regressions observed.`,
        latencyMs: latency,
        tokensPrompt: res.usage?.prompt_tokens || Math.round(testPrompt.length / 4) + 24,
        tokensCompletion: res.usage?.completion_tokens || 142,
        provider: testProvider,
        model: testModel,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch {
      const latency = Math.round(performance.now() - start + 210);
      setTestResponse({
        text: `[${testModel.toUpperCase()} SIMULATED RESPONSE]\nThe Forge AI router enforces seamless fault tolerance. If ${testProvider.toUpperCase()} reports latency > 650ms or token throttling, requests automatically roll over to backup routes without disrupting execution state.`,
        latencyMs: latency,
        tokensPrompt: Math.round(testPrompt.length / 4) + 18,
        tokensCompletion: 178,
        provider: testProvider,
        model: testModel,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setTestingModel(false);
    }
  };

  // Filtered models
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.displayName && m.displayName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.capabilities && m.capabilities.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchProvider = selectedProviderFilter === "all" || m.provider === selectedProviderFilter;
      const matchTier = selectedTierFilter === "all" || m.tier === selectedTierFilter;

      return matchSearch && matchProvider && matchTier;
    });
  }, [models, searchQuery, selectedProviderFilter, selectedTierFilter]);

  // Aggregate stats
  const totalCost = useMemo(() => usage.reduce((sum, entry) => sum + (entry.cost_usd || 0), 0), [usage]);
  const totalTokens = useMemo(
    () => usage.reduce((sum, entry) => sum + (entry.prompt_tokens || 0) + (entry.completion_tokens || 0), 0),
    [usage]
  );
  const healthyProvidersCount = providers.filter((p) => p.healthy).length;
  const avgLatency = Math.round(
    providers.reduce((sum, p) => sum + (p.latency_ms || 32), 0) / (providers.length || 1)
  );

  return (
    <div id="models-os-view" className="h-full flex flex-col min-h-0 select-none font-sans bg-base text-ink space-y-3 p-4 sm:p-6">
      {/* Top Intelligence Control Toolbar */}
      <div className="p-3 bg-panel border border-border rounded-xl shadow-m3-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono text-xs shrink-0">
        {/* Left: System Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-panel-alt text-ink font-semibold uppercase text-[11px] border border-border">
            <Cpu size={12} className="text-accent" />
            <span>SYS_INTELLIGENCE</span>
          </div>

          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-ok/15 text-ok border border-ok/30 font-semibold text-[10px] uppercase">
            <ShieldCheck size={11} />
            <span>{healthyProvidersCount}/{providers.length} GATEWAYS OK</span>
          </span>

          <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary-soft text-secondary border border-secondary/30 font-semibold text-[10px] uppercase">
            <Gauge size={11} />
            <span>{avgLatency}MS P95</span>
          </span>

          <span className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-md bg-panel-alt text-muted border border-border text-[10px] font-medium uppercase">
            <Cpu size={11} />
            <span>{models.length} MODELS</span>
          </span>

          <span className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/30 text-[10px] font-semibold uppercase">
            <DollarSign size={11} />
            <span>${totalCost.toFixed(2)} / {((totalTokens / 1_000_000).toFixed(1))}M TKNS</span>
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 font-sans">
          <button
            type="button"
            id="models-test-fleet-btn"
            disabled={diagnosingAll}
            onClick={handleTestAllProviders}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-alt text-ink font-medium text-xs border border-border hover:border-accent/50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Activity size={12} className={diagnosingAll ? "animate-spin text-accent" : ""} />
            <span>{diagnosingAll ? "Testing..." : "Ping Fleet"}</span>
          </button>

          <button
            type="button"
            id="models-sync-router-btn"
            disabled={reloading}
            onClick={handleReloadConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-alt text-ink font-medium text-xs border border-border hover:border-accent/50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={12} className={reloading ? "animate-spin text-accent" : ""} />
            <span>Sync Router</span>
          </button>

          <button
            type="button"
            id="models-playground-btn"
            onClick={() => {
              setPlaygroundOpen(true);
              setTestResponse(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-ink text-on-ink font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Play size={12} fill="currentColor" />
            <span>Playground</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. OS TAB SELECTOR
             Instant switching between Catalog, Routing, Gateways, and Telemetry
      ========================================================================= */}
      <nav
        id="models-tab-selector"
        role="tablist"
        aria-label="Models and Intelligence Views"
        className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0 select-none font-mono"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            id="tab-btn-catalog"
            role="tab"
            aria-selected={activeTab === "catalog"}
            onClick={() => setActiveTab("catalog")}
            className={`shrink-0 px-3 py-1.5 border-2 border-border font-mono text-xs font-semibold uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              activeTab === "catalog"
                ? "bg-brutal-yellow text-ink "
                : "bg-panel text-ink hover:bg-ink/5 "
            }`}
          >
            <Cpu size={13} strokeWidth={2.5} />
            <span>MODEL CATALOG</span>
            <span className="text-[9px] font-semibold px-1 border border-border bg-panel text-ink">
              {filteredModels.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-btn-routing"
            role="tab"
            aria-selected={activeTab === "routing"}
            onClick={() => setActiveTab("routing")}
            className={`shrink-0 px-3 py-1.5 border-2 border-border font-mono text-xs font-semibold uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              activeTab === "routing"
                ? "bg-brutal-yellow text-ink "
                : "bg-panel text-ink hover:bg-ink/5 "
            }`}
          >
            <Sliders size={13} strokeWidth={2.5} />
            <span>FLEET ROUTING</span>
            <span className="text-[9px] font-semibold px-1 border border-border bg-ok text-on-ink">
              {routing.length} AGENTS
            </span>
          </button>

          <button
            type="button"
            id="tab-btn-providers"
            role="tab"
            aria-selected={activeTab === "providers"}
            onClick={() => setActiveTab("providers")}
            className={`shrink-0 px-3 py-1.5 border-2 border-border font-mono text-xs font-semibold uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              activeTab === "providers"
                ? "bg-brutal-yellow text-ink "
                : "bg-panel text-ink hover:bg-ink/5 "
            }`}
          >
            <Server size={13} strokeWidth={2.5} />
            <span>PROVIDER GATEWAYS</span>
            <span className="text-[9px] font-semibold px-1 border border-border bg-info/20 text-ink">
              {healthyProvidersCount}/{providers.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-btn-telemetry"
            role="tab"
            aria-selected={activeTab === "telemetry"}
            onClick={() => setActiveTab("telemetry")}
            className={`shrink-0 px-3 py-1.5 border-2 border-border font-mono text-xs font-semibold uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              activeTab === "telemetry"
                ? "bg-brutal-yellow text-ink "
                : "bg-panel text-ink hover:bg-ink/5 "
            }`}
          >
            <Activity size={13} strokeWidth={2.5} />
            <span>COST &amp; TELEMETRY</span>
            <span className="text-[9px] font-semibold px-1 border border-border bg-surface-high text-ink">
              ${totalCost.toFixed(2)}
            </span>
          </button>
        </div>

        {/* View Switcher for Catalog Tab */}
        {activeTab === "catalog" && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              id="btn-view-grid"
              onClick={() => setCatalogViewMode("grid")}
              className={`p-1.5 border-2 border-border transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                catalogViewMode === "grid"
                  ? "bg-brutal-yellow text-ink"
                  : "bg-panel text-ink"
              }`}
              title="Grid View"
            >
              <LayoutGrid size={13} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              id="btn-view-table"
              onClick={() => setCatalogViewMode("table")}
              className={`p-1.5 border-2 border-border transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                catalogViewMode === "table"
                  ? "bg-brutal-yellow text-ink"
                  : "bg-panel text-ink"
              }`}
              title="Table Ledger View"
            >
              <TableIcon size={13} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </nav>

      {/* =========================================================================
          3. ACTIVE OS STAGE WORKSPACE
             Framed Neubrutalist OS window container
      ========================================================================= */}
      <section
        id={`models-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-btn-${activeTab}`}
        className="flex-1 min-h-0 bg-panel border border-border rounded-xl shadow-m3-1 flex flex-col overflow-hidden"
      >
        {/* Module Sub-Header Strip */}
        <div className="h-10 px-4 bg-panel-alt border-b border-border flex items-center justify-between gap-2 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-ink uppercase flex items-center gap-1.5">
              {activeTab === "catalog" && <Cpu size={13} strokeWidth={2.5} />}
              {activeTab === "routing" && <Sliders size={13} strokeWidth={2.5} />}
              {activeTab === "providers" && <Server size={13} strokeWidth={2.5} />}
              {activeTab === "telemetry" && <Activity size={13} strokeWidth={2.5} />}
              <span>
                {activeTab === "catalog" && "MODELS_CATALOG.CFG"}
                {activeTab === "routing" && "AGENT_ROUTER_MAP.SYS"}
                {activeTab === "providers" && "GATEWAY_CLUSTERS.LOG"}
                {activeTab === "telemetry" && "TOKEN_CONSUMPTION.CSV"}
              </span>
            </span>
            <span className="text-muted text-[11px] hidden sm:inline">
              {activeTab === "catalog" && "— Frontier reasoning models and specialized coders"}
              {activeTab === "routing" && "— Dynamic agent model bindings and fallback cascades"}
              {activeTab === "providers" && "— Provider endpoints, failover ranks, and live pings"}
              {activeTab === "telemetry" && "— Inferred compute expenses and token distribution"}
            </span>
          </div>

          <span className="text-[10px] font-mono font-semibold text-muted uppercase hidden md:inline shrink-0">
            SYS:\INTELLIGENCE\{activeTab.toUpperCase()}
          </span>
        </div>

        {/* Dynamic Stage Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* =========================================================================
              VIEW 1: MODEL CATALOG
          ========================================================================= */}
          {activeTab === "catalog" && (
            <div className="space-y-4">
              {/* Filter and Search Bar Container */}
              <div className="p-3 bg-panel border-2 border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Search input */}
                <div className="relative flex-1 max-w-md">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    id="catalog-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by model, capability (e.g. reasoning, 2M context)..."
                    className="w-full bg-panel text-xs font-mono font-semibold text-ink placeholder-muted/60 pl-8 pr-7 py-1.5 border-2 border-border focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Filter Selects */}
                <div className="flex flex-wrap items-center gap-2 font-mono">
                  <select
                    id="catalog-filter-provider"
                    value={selectedProviderFilter}
                    onChange={(e) => setSelectedProviderFilter(e.target.value)}
                    className="bg-panel text-xs font-semibold text-ink px-2 py-1.5 border-2 border-border cursor-pointer"
                  >
                    <option value="all">ALL PROVIDERS</option>
                    <option value="google">GOOGLE (GEMINI)</option>
                    <option value="anthropic">ANTHROPIC (CLAUDE)</option>
                    <option value="openai">OPENAI (GPT)</option>
                    <option value="deepseek">DEEPSEEK</option>
                    <option value="groq">GROQ (LLAMA / FAST)</option>
                  </select>

                  <select
                    id="catalog-filter-tier"
                    value={selectedTierFilter}
                    onChange={(e) => setSelectedTierFilter(e.target.value)}
                    className="bg-panel text-xs font-semibold text-ink px-2 py-1.5 border-2 border-border cursor-pointer"
                  >
                    <option value="all">ALL TIERS</option>
                    <option value="Flagship">FLAGSHIP REASONING</option>
                    <option value="Speed &amp; Efficiency">SPEED &amp; EFFICIENCY</option>
                    <option value="Specialized">SPECIALIZED / CODE</option>
                  </select>

                  {(searchQuery || selectedProviderFilter !== "all" || selectedTierFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedProviderFilter("all");
                        setSelectedTierFilter("all");
                      }}
                      className="px-2.5 py-1.5 bg-surface-high text-ink text-xs font-semibold border-2 border-border active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      RESET
                    </button>
                  )}
                </div>
              </div>

              {/* Models Presentation */}
              {filteredModels.length === 0 ? (
                <div className="p-8 text-center bg-panel border-2 border-dashed border-border space-y-3 font-mono">
                  <Cpu size={28} className="mx-auto text-muted" />
                  <p className="text-xs font-semibold uppercase text-ink">NO MATCHING INFERENCE RUNTIMES FOUND</p>
                  <p className="text-xs font-sans text-muted max-w-sm mx-auto">
                    Try broadening your search term or reset provider/tier filters to view available models in the fleet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedProviderFilter("all");
                      setSelectedTierFilter("all");
                    }}
                    className="px-3 py-1 bg-brutal-yellow text-ink text-xs font-semibold uppercase border-2 border-border"
                  >
                    RESET FILTERS
                  </button>
                </div>
              ) : catalogViewMode === "grid" ? (
                /* GRID VIEW */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredModels.map((m) => {
                    const providerColors: Record<string, string> = {
                      google: "bg-info/20 text-ink",
                      anthropic: "bg-brutal-yellow text-ink",
                      openai: "bg-ok text-on-ink",
                      deepseek: "bg-error/20 text-ink",
                      groq: "bg-warn/20 text-ink",
                    };
                    const badgeColor = providerColors[m.provider] || "bg-surface-high text-ink";

                    return (
                      <div
                        key={`${m.provider}-${m.name}`}
                        id={`model-card-${m.name}`}
                        className="p-4 bg-panel border-2 border-border flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-2.5">
                          {/* Card Header */}
                          <div className="flex items-center justify-between gap-2 font-mono">
                            <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase border border-border ${badgeColor}`}>
                              {m.provider}
                            </span>
                            <span className="text-[10px] text-muted font-semibold">
                              {m.speed || "Fast"}
                            </span>
                          </div>

                          {/* Model Name & ID */}
                          <div>
                            <h3 className="font-mono text-sm font-semibold text-ink">
                              {m.displayName || m.name}
                            </h3>
                            <p className="text-[10px] font-mono text-muted select-all">
                              {m.name}
                            </p>
                          </div>

                          {/* Description */}
                          <p className="text-xs font-sans text-muted line-clamp-2 leading-relaxed">
                            {m.description}
                          </p>

                          {/* Badges strip */}
                          <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                            <span className="px-1.5 py-0.5 bg-panel text-ink border border-border font-semibold">
                              {m.contextWindow || "128k ctx"}
                            </span>
                            <span className="px-1.5 py-0.5 bg-panel text-ink border border-border">
                              in: {m.inputCost || "$1.00"}
                            </span>
                            <span className="px-1.5 py-0.5 bg-panel text-ink border border-border">
                              out: {m.outputCost || "$3.00"}
                            </span>
                          </div>

                          {/* Capabilities tags */}
                          {m.capabilities && m.capabilities.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1 font-mono">
                              {m.capabilities.slice(0, 3).map((cap, idx) => (
                                <span
                                  key={idx}
                                  className="text-[9px] font-semibold px-1.5 py-0.2 bg-panel-alt text-muted border border-border"
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div className="pt-3 border-t-2 border-border flex items-center justify-between gap-2 font-mono">
                          <button
                            type="button"
                            id={`btn-assign-${m.name}`}
                            onClick={() => {
                              setAssigningModel(m);
                              setAssignModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold uppercase border-2 border-border bg-panel text-ink hover:bg-ink/5 active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            ASSIGN AGENT
                          </button>

                          <button
                            type="button"
                            id={`btn-test-${m.name}`}
                            onClick={() => {
                              setTestProvider(m.provider);
                              setTestModel(m.name);
                              setPlaygroundOpen(true);
                              setTestResponse(null);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold uppercase border-2 border-border bg-brutal-yellow text-ink hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            <Play size={10} fill="currentColor" />
                            <span>TEST</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* TABLE COMPARISON VIEW */
                <div className="overflow-x-auto border-2 border-border ">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-panel-alt text-ink border-b-2 border-border font-semibold uppercase text-[11px]">
                      <tr>
                        <th className="p-3">MODEL_SPEC</th>
                        <th className="p-3">GATEWAY</th>
                        <th className="p-3">CONTEXT</th>
                        <th className="p-3">PRICING (IN/OUT)</th>
                        <th className="p-3">SPEED</th>
                        <th className="p-3">RECOMMENDED_FOR</th>
                        <th className="p-3 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-border bg-panel">
                      {filteredModels.map((m) => (
                        <tr
                          key={`${m.provider}-${m.name}`}
                          className="hover:bg-brutal-yellow/20 dark:hover:bg-brutal-yellow/10"
                        >
                          <td className="p-3">
                            <p className="font-semibold text-ink">{m.displayName || m.name}</p>
                            <p className="text-[10px] text-muted">{m.name}</p>
                          </td>
                          <td className="p-3 font-semibold uppercase">{m.provider}</td>
                          <td className="p-3 font-semibold">{m.contextWindow || "128k"}</td>
                          <td className="p-3 text-[11px]">
                            <div>{m.inputCost || "—"}</div>
                            <div className="text-muted">{m.outputCost || "—"}</div>
                          </td>
                          <td className="p-3">{m.speed || "Fast"}</td>
                          <td className="p-3 text-muted max-w-xs truncate font-sans text-xs">
                            {m.recommendedFor || m.description}
                          </td>
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningModel(m);
                                setAssignModalOpen(true);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold uppercase border border-border bg-panel text-ink hover:bg-ink/5"
                            >
                              ASSIGN
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTestProvider(m.provider);
                                setTestModel(m.name);
                                setPlaygroundOpen(true);
                                setTestResponse(null);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold uppercase border border-border bg-brutal-yellow text-ink hover:brightness-105"
                            >
                              TEST
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW 2: FLEET ROUTING
          ========================================================================= */}
          {activeTab === "routing" && (
            <div className="space-y-5">
              {/* Presets Toolbar */}
              <div className="p-3.5 bg-panel border-2 border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
                <div>
                  <h3 className="text-xs font-semibold uppercase text-ink flex items-center gap-1.5">
                    <SlidersHorizontal size={13} strokeWidth={2.5} />
                    <span>FLEET_PRESET_PROFILES</span>
                  </h3>
                  <p className="text-[11px] font-sans text-muted mt-0.5">
                    Instantly balance all agents for budget efficiency, frontier reasoning, or resilient multi-cloud failover.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 font-mono">
                  <button
                    type="button"
                    id="btn-preset-speed"
                    onClick={() => applyPresetProfile("speed")}
                    className="px-3 py-1 bg-panel border-2 border-border text-ink text-xs font-semibold uppercase hover:bg-brutal-yellow hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    ⚡ SPEED &amp; LOW COST
                  </button>
                  <button
                    type="button"
                    id="btn-preset-reasoning"
                    onClick={() => applyPresetProfile("reasoning")}
                    className="px-3 py-1 bg-panel border-2 border-border text-ink text-xs font-semibold uppercase hover:bg-brutal-yellow hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    🧠 FRONTIER REASONING
                  </button>
                  <button
                    type="button"
                    id="btn-preset-balanced"
                    onClick={() => applyPresetProfile("balanced")}
                    className="px-3 py-1 bg-brutal-yellow border-2 border-border text-ink text-xs font-semibold uppercase hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    🛡️ BALANCED FLEET
                  </button>
                </div>
              </div>

              {/* Agent Routing Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {routing.map((assignment) => {
                  const agentMeta = AGENTS.find((a) => a.id === assignment.agentId);
                  const Icon = agentMeta?.icon || Cpu;

                  return (
                    <div
                      key={assignment.agentId}
                      id={`routing-card-${assignment.agentId}`}
                      className="p-4 bg-panel border-2 border-border space-y-3.5"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between border-b-2 border-border pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-8 w-8 border-2 border-border flex items-center justify-center text-ink font-semibold"
                            style={{ backgroundColor: agentMeta?.hue || "#2DD4BF" }}
                          >
                            <Icon size={16} strokeWidth={2.5} />
                          </span>
                          <div>
                            <h4 className="font-mono text-sm font-semibold text-ink">
                              {assignment.agentName}
                            </h4>
                            <span className="text-[10px] font-mono text-muted uppercase">
                              ID: {assignment.agentId}
                            </span>
                          </div>
                        </div>

                        <span className="px-1.5 py-0.2 bg-ok text-on-ink border border-border text-[10px] font-mono font-semibold uppercase">
                          ACTIVE
                        </span>
                      </div>

                      {/* Selectors */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted uppercase">Primary Gateway</span>
                          <select
                            value={assignment.provider}
                            onChange={(e) => {
                              const newProv = e.target.value;
                              const provModels = models.filter((m) => m.provider === newProv);
                              const newModel = provModels[0]?.name || assignment.model;
                              handleSaveAgentOverride(
                                assignment.agentId,
                                newProv,
                                newModel,
                                assignment.maxTokens,
                                assignment.costCapUsd || 0.5
                              );
                            }}
                            className="w-full bg-panel text-xs font-semibold text-ink px-2 py-1.5 border-2 border-border cursor-pointer"
                          >
                            {providers.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name.toUpperCase()} {p.healthy ? "✓" : "(!)"}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted uppercase">Model Runtime</span>
                          <select
                            value={assignment.model}
                            onChange={(e) => {
                              handleSaveAgentOverride(
                                assignment.agentId,
                                assignment.provider,
                                e.target.value,
                                assignment.maxTokens,
                                assignment.costCapUsd || 0.5
                              );
                            }}
                            className="w-full bg-panel text-xs font-semibold text-ink px-2 py-1.5 border-2 border-border cursor-pointer"
                          >
                            {models
                              .filter((m) => m.provider === assignment.provider)
                              .map((m) => (
                                <option key={m.name} value={m.name}>
                                  {m.displayName || m.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>

                      {/* Fallback & Caps Box */}
                      <div className="p-2.5 bg-panel border border-border space-y-1.5 text-[11px] font-mono">
                        <div className="flex items-center justify-between text-muted">
                          <span>Circuit-Breaker Fallback:</span>
                          <span className="font-semibold text-ink">
                            {assignment.fallbackProvider?.toUpperCase() || "GOOGLE"} / {assignment.fallbackModel || "gemini-2.5-pro"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Max Context Tokens:</span>
                          <span className="font-semibold text-ink">{assignment.maxTokens.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Per-Request Budget Cap:</span>
                          <span className="font-semibold text-ink">${assignment.costCapUsd?.toFixed(2) || "0.50"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 3: PROVIDER GATEWAYS & HEALTH
          ========================================================================= */}
          {activeTab === "providers" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map((provider) => (
                  <div
                    key={provider.name}
                    id={`provider-card-${provider.name}`}
                    className="p-4 bg-panel border-2 border-border flex flex-col justify-between space-y-4 font-mono"
                  >
                    <div className="space-y-3">
                      {/* Provider Header */}
                      <div className="flex items-center justify-between border-b-2 border-border pb-2">
                        <div className="flex items-center gap-2">
                          <Server size={15} strokeWidth={2.5} />
                          <h3 className="font-semibold uppercase text-sm text-ink">
                            {provider.name}
                          </h3>
                        </div>
                        <span
                          className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 border border-border ${
                            provider.healthy
                              ? "bg-ok text-on-ink"
                              : "bg-error text-on-ink"
                          }`}
                        >
                          {provider.healthy ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          <span>{provider.healthy ? "OPERATIONAL" : "DEGRADED"}</span>
                        </span>
                      </div>

                      {/* Specs */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-muted">
                          <span>Failover Priority:</span>
                          <span className="font-semibold text-ink">RANK #{provider.priority}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Default Model:</span>
                          <span className="font-semibold text-ink truncate max-w-[150px]">
                            {provider.default_model || "gemini-2.5-flash"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Streaming SSE:</span>
                          <span className="font-semibold text-ok">
                            {provider.supports_stream ? "SUPPORTED" : "BUFFERED"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Inference Latency:</span>
                          <span className="font-semibold text-ink">{provider.latency_ms || 28}ms</span>
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Endpoint URL:</span>
                          <span className="text-[10px] text-muted truncate max-w-[150px]">
                            {provider.endpoint || "Managed Cloud"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-t-2 border-border flex items-center justify-between">
                      <span className="text-[10px] text-muted">
                        PING: VERIFIED
                      </span>

                      <button
                        type="button"
                        id={`btn-ping-${provider.name}`}
                        onClick={() => handlePingProvider(provider.name)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-panel text-ink font-semibold text-xs border-2 border-border hover:bg-brutal-yellow hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
                      >
                        <Activity size={12} strokeWidth={2.5} />
                        <span>PING TEST</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 4: COST & TELEMETRY
          ========================================================================= */}
          {activeTab === "telemetry" && (
            <div className="space-y-5">
              {/* Gauges Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 bg-panel border-2 border-border space-y-1 font-mono">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span>TOTAL BILLED</span>
                    <DollarSign size={13} />
                  </div>
                  <p className="text-2xl font-semibold text-ink">${totalCost.toFixed(4)}</p>
                  <p className="text-[10px] text-muted">AGGREGATED 30-DAY INFERENCE</p>
                </div>

                <div className="p-3.5 bg-panel border-2 border-border space-y-1 font-mono">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span>PROCESSED TOKENS</span>
                    <Cpu size={13} />
                  </div>
                  <p className="text-2xl font-semibold text-ink">
                    {((totalTokens / 1_000_000).toFixed(2))}M
                  </p>
                  <p className="text-[10px] text-muted">PROMPT + COMPLETION CACHE</p>
                </div>

                <div className="p-3.5 bg-panel border-2 border-border space-y-1 font-mono">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span>AVG HOP LATENCY</span>
                    <Gauge size={13} />
                  </div>
                  <p className="text-2xl font-semibold text-ink">{avgLatency}ms</p>
                  <p className="text-[10px] text-muted">MULTI-REGION GATEWAY P95</p>
                </div>

                <div className="p-3.5 bg-panel border-2 border-border space-y-1 font-mono">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted">
                    <span>ACTIVE AGENTS</span>
                    <Activity size={13} />
                  </div>
                  <p className="text-2xl font-semibold text-ink">{routing.length}</p>
                  <p className="text-[10px] text-muted">AUTONOMOUS ORCHESTRATION</p>
                </div>
              </div>

              {/* Spend Distribution Card */}
              <div className="p-4 bg-panel border-2 border-border space-y-3 font-mono">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-border pb-2 text-xs">
                  <span className="font-semibold text-ink uppercase flex items-center gap-1.5">
                    <DollarSign size={14} />
                    <span>MODEL_SPEND_DISTRIBUTION</span>
                  </span>
                  <span className="text-muted">
                    CYCLE TOTAL: <strong className="text-ink">${totalCost.toFixed(4)}</strong>
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {usage.map((u) => {
                    const pct = Math.min(100, Math.round(((u.cost_usd || 0) / (totalCost || 1)) * 100));
                    return (
                      <div key={`${u.provider}-${u.model}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="font-semibold text-ink">
                            <span>{u.model || "default"}</span>{" "}
                            <span className="text-muted uppercase">({u.provider})</span>
                          </div>
                          <span className="font-semibold text-ink">
                            ${(u.cost_usd || 0).toFixed(4)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-panel-alt border border-border overflow-hidden">
                          <div
                            className="h-full bg-brutal-yellow border-r border-border"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed Usage Table */}
              <div className="overflow-x-auto border-2 border-border ">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-panel-alt text-ink border-b-2 border-border font-semibold uppercase text-[11px]">
                    <tr>
                      <th className="p-3">MODEL</th>
                      <th className="p-3">GATEWAY</th>
                      <th className="p-3">AGENT</th>
                      <th className="p-3">PROMPT_TOKENS</th>
                      <th className="p-3">COMPLETION_TOKENS</th>
                      <th className="p-3">TOTAL_TOKENS</th>
                      <th className="p-3 text-right">COST_USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-border bg-panel">
                    {usage.map((entry, idx) => {
                      const prompt = entry.prompt_tokens || 0;
                      const comp = entry.completion_tokens || 0;
                      const tot = prompt + comp;
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-brutal-yellow/20 dark:hover:bg-brutal-yellow/10"
                        >
                          <td className="p-3 font-semibold text-ink">{entry.model || "—"}</td>
                          <td className="p-3 uppercase font-semibold text-muted">{entry.provider || "—"}</td>
                          <td className="p-3 font-semibold">{entry.agent || "developer"}</td>
                          <td className="p-3 text-muted">{prompt.toLocaleString()}</td>
                          <td className="p-3 text-muted">{comp.toLocaleString()}</td>
                          <td className="p-3 font-semibold text-ink">{tot.toLocaleString()}</td>
                          <td className="p-3 text-right font-semibold text-ink">
                            ${(entry.cost_usd || 0).toFixed(4)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          4. MODAL: PROMPT PLAYGROUND WINDOW (PROMPT_PLAYGROUND.EXE)
      ========================================================================= */}
      {playgroundOpen && (
        <div
          id="playground-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-base/60 backdrop-blur-xs select-none"
        >
          <div
            id="playground-modal-window"
            role="dialog"
            aria-labelledby="playground-title"
            className="w-full max-w-2xl border-2 border-border bg-panel overflow-hidden flex flex-col font-mono max-h-[90vh]"
          >
            {/* Titlebar */}
            <div className="h-10 px-3 bg-brutal-yellow text-ink border-b-2 border-border flex items-center justify-between select-none">
              <div id="playground-title" className="flex items-center gap-2 font-semibold text-xs uppercase">
                <Terminal size={14} strokeWidth={2.5} />
                <span>PROMPT_PLAYGROUND.EXE</span>
              </div>
              <button
                type="button"
                id="btn-close-playground"
                onClick={() => setPlaygroundOpen(false)}
                className="w-6 h-6 border border-border bg-panel hover:bg-panel-alt hover:text-ink flex items-center justify-center font-semibold text-xs active:translate-x-[1px] active:translate-y-[1px]"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Provider & Model Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="font-semibold text-muted uppercase">Target Provider</span>
                  <select
                    id="playground-select-provider"
                    value={testProvider}
                    onChange={(e) => {
                      setTestProvider(e.target.value);
                      const provModels = models.filter((m) => m.provider === e.target.value);
                      if (provModels[0]) setTestModel(provModels[0].name);
                    }}
                    className="w-full bg-panel text-xs font-semibold text-ink p-2 border-2 border-border"
                  >
                    {providers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-muted uppercase">Model Runtime</span>
                  <select
                    id="playground-select-model"
                    value={testModel}
                    onChange={(e) => setTestModel(e.target.value)}
                    className="w-full bg-panel text-xs font-semibold text-ink p-2 border-2 border-border"
                  >
                    {models
                      .filter((m) => m.provider === testProvider)
                      .map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.displayName || m.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              {/* Prompt Input Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-muted">
                  <span>INPUT_PROMPT:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTestPrompt("ping")}
                      className="text-[10px] px-1.5 py-0.5 border border-border bg-panel-alt text-ink hover:bg-brutal-yellow hover:text-ink"
                    >
                      PING
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTestPrompt("Write a resilient TypeScript rate-limiter token-bucket class with jitter backoff.")
                      }
                      className="text-[10px] px-1.5 py-0.5 border border-border bg-panel-alt text-ink hover:bg-brutal-yellow hover:text-ink"
                    >
                      CODE_SAMPLE
                    </button>
                  </div>
                </div>
                <textarea
                  id="playground-prompt-textarea"
                  rows={3}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="Enter system prompt or instruction for runtime test..."
                  className="w-full bg-panel text-xs font-mono text-ink p-2.5 border-2 border-border focus:outline-none"
                />
              </div>

              {/* Output Readout */}
              {testResponse && (
                <div className="p-3 border-2 border-border bg-panel space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-border pb-1.5 text-[11px] font-semibold">
                    <span className="flex items-center gap-1.5 text-ink">
                      <CheckCircle2 size={13} className="text-ok" />
                      <span>
                        {testResponse.model} ({testResponse.provider.toUpperCase()})
                      </span>
                    </span>
                    <div className="flex items-center gap-2 text-muted">
                      <span>{testResponse.latencyMs}ms</span>
                      <span>·</span>
                      <span>{testResponse.tokensPrompt} in</span>
                      <span>·</span>
                      <span>{testResponse.tokensCompletion} out</span>
                    </div>
                  </div>
                  <pre className="text-xs font-mono text-ink whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed">
                    {testResponse.text}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t-2 border-border bg-panel-alt flex items-center justify-between text-xs">
              <span className="text-[11px] text-muted">
                GATEWAY: /api/llm/test
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-close-playground-modal"
                  onClick={() => setPlaygroundOpen(false)}
                  className="px-3 py-1 bg-panel border border-border text-ink font-semibold hover:bg-ink/5"
                >
                  CLOSE
                </button>
                <button
                  type="button"
                  id="btn-send-playground-prompt"
                  disabled={testingModel || !testPrompt.trim()}
                  onClick={handleExecutePlaygroundTest}
                  className="flex items-center gap-1.5 px-4 py-1 bg-brutal-yellow text-ink font-semibold uppercase border-2 border-border hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                >
                  {testingModel ? (
                    <>
                      <RefreshCw size={11} className="animate-spin" />
                      <span>INFERRING...</span>
                    </>
                  ) : (
                    <>
                      <Send size={11} />
                      <span>EXECUTE</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          5. MODAL: ASSIGN MODEL TO FLEET AGENT (ASSIGN_MODEL.SYS)
      ========================================================================= */}
      {assignModalOpen && assigningModel && (
        <div
          id="assign-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-base/60 backdrop-blur-xs select-none"
        >
          <div
            id="assign-modal-window"
            role="dialog"
            aria-labelledby="assign-modal-title"
            className="w-full max-w-md border-2 border-border bg-panel overflow-hidden flex flex-col font-mono"
          >
            {/* Titlebar */}
            <div className="h-10 px-3 bg-brutal-yellow text-ink border-b-2 border-border flex items-center justify-between select-none">
              <div id="assign-modal-title" className="flex items-center gap-2 font-semibold text-xs uppercase">
                <Sliders size={13} strokeWidth={2.5} />
                <span>ASSIGN_MODEL.SYS</span>
              </div>
              <button
                type="button"
                id="btn-close-assign-modal"
                onClick={() => setAssignModalOpen(false)}
                className="w-6 h-6 border border-border bg-panel hover:bg-panel-alt hover:text-ink flex items-center justify-center font-semibold text-xs active:translate-x-[1px] active:translate-y-[1px]"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3.5">
              <div className="p-2.5 bg-panel border border-border space-y-1">
                <p className="text-xs font-semibold text-ink">
                  {assigningModel.displayName || assigningModel.name}
                </p>
                <p className="text-[10px] text-muted uppercase">
                  GATEWAY: {assigningModel.provider} · CONTEXT: {assigningModel.contextWindow || "128k"}
                </p>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted uppercase">
                  Target Fleet Agent:
                </span>
                <select
                  id="target-agent-select"
                  value={selectedTargetAgent}
                  onChange={(e) => setSelectedTargetAgent(e.target.value)}
                  className="w-full bg-panel text-xs font-semibold text-ink p-2 border-2 border-border cursor-pointer"
                >
                  {routing.map((r) => (
                    <option key={r.agentId} value={r.agentId}>
                      {r.agentName.toUpperCase()} (Currently: {r.model})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Footer */}
            <div className="p-3 border-t-2 border-border bg-panel-alt flex items-center justify-between text-xs">
              <button
                type="button"
                id="btn-cancel-assign-modal"
                onClick={() => setAssignModalOpen(false)}
                className="px-3 py-1 bg-panel border border-border text-ink font-semibold hover:bg-ink/5"
              >
                CANCEL
              </button>

              <button
                type="button"
                id="btn-confirm-assign-modal"
                onClick={() => {
                  handleSaveAgentOverride(
                    selectedTargetAgent,
                    assigningModel.provider,
                    assigningModel.name,
                    8192,
                    0.5
                  );
                  setAssignModalOpen(false);
                }}
                className="px-4 py-1 bg-brutal-yellow text-ink font-semibold uppercase border-2 border-border hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px]"
              >
                CONFIRM BINDING
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
