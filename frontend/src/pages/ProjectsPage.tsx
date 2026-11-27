import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Pin,
  Clock,
  ArrowUpRight,
  ArrowRight,
  Globe,
  Activity,
  FolderGit2,
  Layers,
  Sparkles,
  FileCode2,
  Copy,
  Check,
  LayoutGrid,
  List,
  ShieldCheck,
  Cpu,
  Terminal,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ExternalLink,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  PROJECTS as MOCK_PROJECTS,
  type Project,
  getCustomProjects,
  saveCustomProject,
} from "../lib/mockData";
import { reposApi, projectsApi } from "../lib/api";
import {
  scaffoldProjectWithGemini,
  analyzeProjectWithGemini,
  expandProjectIdeaWithGemini,
  type ProjectAnalysis,
  type IdeaOption,
} from "../lib/geminiProject";
import { formatRelativeTime } from "../lib/format";
import { atmosphereSwatch } from "../lib/coverArt";
import { motion } from "../lib/animations";
import { SuiWindowFrame, BottomNavItem } from "../components/pm/SuiWindowFrame";
import { AGENTS } from "../lib/agents";
import { VoiceInputButton } from "../components/pm/VoiceInputButton";

/* ------------------------------------------------------------------ */
/* Subtle Cyber Audio Synthesizer (matches Initiative Page)            */
/* ------------------------------------------------------------------ */

class CyberAudioSynth {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playClick(pitch = 880) {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.8, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio fallback
    }
  }

  playSwitch() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch {
      // Audio fallback
    }
  }
}

const synth = new CyberAudioSynth();

/* ------------------------------------------------------------------ */
/* Types & Constants                                                  */
/* ------------------------------------------------------------------ */

type DashboardTab = "all" | "repos" | "deployments" | "activity";
type ViewMode = "grid" | "table";
type ProjectStatusFilter = "all" | "active" | "complete" | "failed";
type SortKey = "recent" | "name" | "status";

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

const DEPLOYMENTS = [
  {
    id: "dep-1",
    project: "Forge Core Engine",
    url: "https://forge-core.prod.run.app",
    environment: "Production",
    uptime: "99.98%",
    status: "Healthy",
    time: "24m ago",
    region: "global-edge (5 regions)",
    latency: "18ms",
    ssl: "Valid (TLS 1.3)",
  },
  {
    id: "dep-2",
    project: "Identity Gateway",
    url: "https://auth.internal.network",
    environment: "Staging",
    uptime: "100%",
    status: "Healthy",
    time: "3h ago",
    region: "us-east1",
    latency: "26ms",
    ssl: "Valid (TLS 1.3)",
  },
  {
    id: "dep-3",
    project: "Telemetry Pipeline",
    url: "https://telemetry.forge.edge",
    environment: "Production",
    uptime: "99.99%",
    status: "Healthy",
    time: "5h ago",
    region: "europe-west1",
    latency: "14ms",
    ssl: "Valid (TLS 1.3)",
  },
];

const ACTIVITIES = [
  {
    id: "act-1",
    action: "Merged pull request #142: OAuth 2.1 PKCE verification with Zod validation",
    project: "Forge Core Engine",
    agent: "Developer Agent",
    badge: "MERGE",
    badgeColor: "bg-agent-business-improver/10 text-agent-business-improver border-agent-business-improver/30",
    time: "15m ago",
  },
  {
    id: "act-2",
    action: "Executed regression test suite (42/42 assertions passed, 0 flakiness)",
    project: "Identity Gateway",
    agent: "QA Specialist",
    badge: "TEST",
    badgeColor: "bg-ok/10 text-ok border-ok/30",
    time: "1h ago",
  },
  {
    id: "act-3",
    action: "Auto-scaled edge cluster replicas to 5 regions across Tokyo, Frankfurt, N.Virginia",
    project: "Telemetry Pipeline",
    agent: "DevOps Agent",
    badge: "SCALE",
    badgeColor: "bg-info/10 text-info border-info/30",
    time: "4h ago",
  },
  {
    id: "act-4",
    action: "Synthesized Zod API contracts and runtime JSON schema validator",
    project: "Forge Core Engine",
    agent: "Architect Agent",
    badge: "SCHEMA",
    badgeColor: "bg-warn/10 text-warn border-warn/30",
    time: "6h ago",
  },
];

// Agent role tones resolve through CSS variables so they adapt to light/dark.
const AGENT_TONE: Record<string, string> = {
  architect: "text-agent-architect",
  business_improver: "text-agent-business-improver",
  designer: "text-agent-designer",
  developer: "text-agent-developer",
  integration: "text-agent-integration",
  pm: "text-agent-pm",
};

function getStatusBadge(status?: string) {
  const s = (status || "ready").toLowerCase();
  if (s === "generating" || s === "planning" || s === "building") {
    return {
      label: "Building",
      bg: "bg-info/10 text-info border-info/30",
      dot: "bg-info",
    };
  }
  if (s === "live" || s === "active") {
    return {
      label: "Live",
      bg: "bg-ok/10 text-ok border-ok/30",
      dot: "bg-ok",
    };
  }
  if (s === "ready" || s === "completed" || s === "done") {
    return {
      label: "Ready",
      bg: "bg-ok/10 text-ok border-ok/30",
      dot: "bg-ok",
    };
  }
  if (s === "failed") {
    return {
      label: "Failed",
      bg: "bg-error/10 text-error border-error/30",
      dot: "bg-error",
    };
  }
  return {
    label: "Active",
    bg: "bg-ok/10 text-ok border-ok/30",
    dot: "bg-ok",
  };
}

/* ------------------------------------------------------------------ */
/* Main ProjectsPage Component                                        */
/* ------------------------------------------------------------------ */

export default function ProjectsPage() {
  const navigate = useNavigate();

  // Navigation & View Mode
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [soundEnabled] = useState(true);

  // Workbench input state
  const [promptInput, setPromptInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // New Project Dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [dialogTab, setDialogTab] = useState<"ai" | "manual">("ai");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectTemplate, setNewProjectTemplate] = useState("saas");

  // Gemini AI Scaffolding State
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTemplate, setAiTemplate] = useState("auto");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiPhase, setAiPhase] = useState("Analyzing domain specification...");
  const [generatedPreview, setGeneratedPreview] = useState<Project | null>(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<string>("");
  const [hasCopiedFile, setHasCopiedFile] = useState(false);

  // Gemini Idea Expander state
  const [isExpandingIdeas, setIsExpandingIdeas] = useState(false);
  const [expandedIdeas, setExpandedIdeas] = useState<IdeaOption[] | null>(null);
  const [showExpandedIdeasPanel, setShowExpandedIdeasPanel] = useState(false);

  // Gemini AI Deep Audit Drawer state
  const [auditProject, setAuditProject] = useState<Project | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ProjectAnalysis | null>(null);

  // Import Repo state (supports test expectations)
  const [showImport, setShowImport] = useState(false);
  const [importRepoUrl, setImportRepoUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Pinned projects in localStorage
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("forge_pinned_projects");
      return stored ? JSON.parse(stored) : ["proj-001", "proj-002"];
    } catch {
      return ["proj-001", "proj-002"];
    }
  });

  // Custom projects (stored in localStorage) + API projects
  const [customProjects, setCustomProjects] = useState<Project[]>(() => getCustomProjects());
  const [apiProjects, setApiProjects] = useState<Project[]>([]);

  useEffect(() => {
    projectsApi
      .list()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setApiProjects(data);
        }
      })
      .catch(() => {
        // Fallback gracefully
      });
  }, []);

  const handleSound = (type: "click" | "switch" = "click") => {
    if (!soundEnabled) return;
    if (type === "switch") {
      synth.playSwitch();
    } else {
      synth.playClick();
    }
  };

  const handleTogglePin = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    handleSound("click");
    setPinnedIds((prev) => {
      const updated = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try {
        localStorage.setItem("forge_pinned_projects", JSON.stringify(updated));
      } catch {
        // ignored
      }
      return updated;
    });
  };

  // Combine mock, custom, and API projects
  const allProjects = useMemo(() => {
    const combined = [...customProjects, ...apiProjects, ...MOCK_PROJECTS];
    const seen = new Set<string>();
    return combined.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [customProjects, apiProjects]);

  const totalProjects = allProjects.length;
  const activeCount = useMemo(
    () => allProjects.filter((p) => p.live || p.status === "ready" || p.status === "live").length,
    [allProjects]
  );
  const completedCount = useMemo(
    () => allProjects.filter((p) => p.status === "ready" || p.status === "completed").length,
    [allProjects]
  );

  // Filtered & sorted projects
  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allProjects.filter((p) => {
      if (statusFilter === "active" && !p.live && p.status !== "live" && p.status !== "ready") {
        return false;
      }
      if (statusFilter === "complete" && p.status !== "ready" && p.status !== "completed") {
        return false;
      }
      if (statusFilter === "failed" && p.status !== "failed") {
        return false;
      }
      if (q) {
        const matchesName = (p.displayName || p.name || "").toLowerCase().includes(q);
        const matchesDesc = (p.description || "").toLowerCase().includes(q);
        const matchesTech = (p.techStack || []).some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesTech) return false;
      }
      return true;
    });

    if (sortKey === "name") {
      return [...filtered].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
    }
    if (sortKey === "status") {
      return [...filtered].sort((a, b) => (a.status || "").localeCompare(b.status || ""));
    }
    return filtered;
  }, [allProjects, search, statusFilter, sortKey]);

  // Handle repository import
  const handleRepoImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importRepoUrl.trim()) return;
    setIsImporting(true);
    handleSound("click");
    try {
      const res = await reposApi.import({ repo_url: importRepoUrl });
      toast.success("Repository imported successfully!");
      setShowImport(false);
      setImportRepoUrl("");
      const importedId = res?.project?.id || res?.id || "p1";
      navigate(`/p/${importedId}/workspace`);
    } catch {
      toast.error("Failed to import repository. Please verify the URL and credentials.");
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Gemini Blueprint Scaffolding
  const handleScaffoldWithGemini = async (promptToUse?: string) => {
    const effectivePrompt = promptToUse || aiPrompt;
    if (!effectivePrompt.trim()) {
      toast.error("Please provide a product or architectural description.");
      return;
    }
    handleSound("click");
    setIsAiGenerating(true);
    try {
      const scaffolded = await scaffoldProjectWithGemini({
        prompt: effectivePrompt,
        template: aiTemplate,
        onPhaseChange: (phase) => setAiPhase(phase),
      });
      setGeneratedPreview(scaffolded);
      if (scaffolded.initialFiles && scaffolded.initialFiles.length > 0) {
        setSelectedPreviewFile(scaffolded.initialFiles[0].path);
      }
      saveCustomProject(scaffolded);
      setCustomProjects((prev) => [scaffolded, ...prev.filter((p) => p.id !== scaffolded.id)]);
      toast.success(
        `Workspace scaffolded via ${scaffolded.liveModel || "gemini-4-hydrogen"}${
          scaffolded.tokenUsage?.totalTokens ? ` (${scaffolded.tokenUsage.totalTokens.toLocaleString()} tokens)` : ""
        }!`
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to scaffold with Gemini");
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Handle Workbench form submission
  const handleScaffoldFromInput = () => {
    if (!promptInput.trim()) return;
    setAiPrompt(promptInput);
    handleScaffoldWithGemini(promptInput);
  };

  // Handle Idea Expansion
  const handleExpandIdeasWithPrompt = async (targetPrompt: string) => {
    if (!targetPrompt.trim()) return;
    handleSound("click");
    setIsExpandingIdeas(true);
    try {
      const options = await expandProjectIdeaWithGemini(targetPrompt);
      setExpandedIdeas(options);
      setShowExpandedIdeasPanel(true);
      toast.success("Generated 3 Gemini architectural proposals!");
    } catch {
      toast.error("Could not expand ideas right now.");
    } finally {
      setIsExpandingIdeas(false);
    }
  };

  const handleExpandIdeas = () => {
    handleExpandIdeasWithPrompt(promptInput);
  };

  const handleScaffoldWithIdea = (idea: IdeaOption) => {
    setPromptInput(idea.refinedPrompt);
    setAiPrompt(idea.refinedPrompt);
    handleScaffoldWithGemini(idea.refinedPrompt);
    setShowExpandedIdeasPanel(false);
  };

  // Handle Deep Architecture Audit
  const handleAudit = async (project: Project) => {
    handleSound("switch");
    setAuditProject(project);
    setIsAuditing(true);
    setAuditResult(null);
    try {
      const analysis = await analyzeProjectWithGemini(project);
      setAuditResult(analysis);
    } catch {
      toast.error("Failed to run Gemini deep architecture audit.");
    } finally {
      setIsAuditing(false);
    }
  };

  // Manual project creation
  const handleCreateManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    handleSound("click");
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name: newProjectName.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
      displayName: newProjectName,
      description: `Custom ${newProjectTemplate} stack with autonomous agent swarm verification.`,
      template: newProjectTemplate,
      techStack:
        newProjectTemplate === "saas"
          ? ["TypeScript", "React", "PostgreSQL", "TailwindCSS"]
          : newProjectTemplate === "api"
          ? ["Go", "gRPC", "Redis", "Docker"]
          : ["Python", "FastAPI", "PostgreSQL"],
      qaScore: 94,
      agents: ["architect", "developer", "pm", "integration"],
      architectureOverview: "Modular microservice architecture with automated CI/CD pipeline.",
      lastBuilt: "Just now",
      live: true,
      status: "ready",
    };
    saveCustomProject(newProj);
    setCustomProjects((prev) => [newProj, ...prev]);
    toast.success(`Created workspace ${newProj.displayName}`);
    setShowNewDialog(false);
    setNewProjectName("");
  };

  const openAiDialog = () => {
    setDialogTab("ai");
    setShowNewDialog(true);
  };

  // Bottom / Top Navigation Tabs (matching SuiWindowFrame)
  const bottomNavItems: BottomNavItem[] = useMemo(
    () => [
      {
        id: "all",
        label: "All Workspaces",
        badge: totalProjects,
        isActive: activeTab === "all",
        onClick: () => {
          handleSound();
          setActiveTab("all");
        },
      },
      {
        id: "repos",
        label: "Repositories",
        badge: 3,
        isActive: activeTab === "repos",
        onClick: () => {
          handleSound();
          setActiveTab("repos");
        },
      },
      {
        id: "deployments",
        label: "Edge Deployments",
        badge: DEPLOYMENTS.length,
        isActive: activeTab === "deployments",
        onClick: () => {
          handleSound();
          setActiveTab("deployments");
        },
      },
      {
        id: "activity",
        label: "Fleet Activity",
        badge: ACTIVITIES.length,
        isActive: activeTab === "activity",
        onClick: () => {
          handleSound();
          setActiveTab("activity");
        },
      },
      {
        id: "templates",
        label: "Templates",
        onClick: () => {
          handleSound();
          inputRef.current?.focus();
          setPromptInput("Distributed rate limiter in Go with Redis sliding window");
        },
      },
      {
        id: "docs",
        label: "Handbook",
        isExternal: true,
        onClick: () => {
          toast("Opening Autonomous Engineering Handbook");
        },
      },
      {
        id: "discord",
        label: "Discord",
        isExternal: true,
        onClick: () => {
          toast("Opening Developer Swarm Community");
        },
      },
    ],
    [totalProjects, activeTab, handleSound]
  );

  return (
    <div className="relative min-h-screen w-full bg-base p-0 sm:p-2 md:p-4 font-sans antialiased text-ink transition-colors duration-200 flex flex-col items-stretch justify-start">
      <div className="w-full flex-1 flex flex-col">
        <SuiWindowFrame
          title="Forge Workspaces 2026"
          tagLabel="status"
          tagText="Production Software"
          navPosition="top"
          navItems={bottomNavItems}
          bottomNavItems={bottomNavItems}
          primaryAction={{
            label: "New Workspace",
            icon: <Sparkles size={14} />,
            onClick: () => {
              handleSound();
              setShowNewDialog(true);
            },
          }}
        >
          <div className="space-y-8 sm:space-y-10">
            {/* =========================================================================
                1. HEADER: two-tone heading, muted subline, one ink CTA + glass pills,
                   and a compact live fleet summary on an atmospheric panel
            ========================================================================= */}
            <section
              aria-label="Workspaces Hero"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch"
            >
              <div className="lg:col-span-7 flex flex-col justify-center gap-5 py-2">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-accent/[0.12] px-2.5 py-1 text-xs font-medium text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  Workspaces
                </span>
                <div>
                  <h1 className="text-headline sm:text-display font-medium tracking-tight text-ink">
                    Engineering Workspaces.{" "}
                    <span className="text-muted">Plan, build and ship with your fleet.</span>
                  </h1>
                  <p className="mt-3 text-body text-muted max-w-xl">
                    Autonomous multi-agent orchestration: plan, build, verify, and deploy production software from high-level architectural briefs. 8 specialist AI agents collaborate across deterministic code generation, tests, and CI/CD.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSound();
                      inputRef.current?.focus();
                      const el = document.getElementById("workspace-synthesizer");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-pill bg-ink px-5 text-sm font-medium text-on-ink transition hover:bg-ink/90 active:scale-[0.98] cursor-pointer"
                  >
                    <span>Scaffold Workspace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSound("switch");
                      openAiDialog();
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-glass-border bg-glass text-ink backdrop-blur-[5px] transition hover:bg-ink/10 cursor-pointer"
                    title="Launch Architect"
                    aria-label="Launch Architect"
                  >
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSound();
                      setShowImport((prev) => !prev);
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-pill border border-glass-border bg-glass px-4 text-sm font-medium text-ink backdrop-blur-[5px] transition hover:bg-ink/10 cursor-pointer"
                  >
                    <FolderGit2 size={15} />
                    <span>Import Repo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSound("switch");
                      openAiDialog();
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-pill border border-accent/25 bg-accent/[0.12] px-4 text-sm font-medium text-accent transition hover:bg-accent/20 cursor-pointer"
                  >
                    <Sparkles size={15} />
                    <span>Gemini AI</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
                    8 Specialist Agents Active
                  </span>
                  <span className="text-faint" aria-hidden="true">·</span>
                  <span>Multi-Agent Fleet</span>
                  <span className="text-faint" aria-hidden="true">·</span>
                  <span>Gemini 3.8 Flash Online</span>
                </div>
              </div>

              {/* Right column: live fleet summary on an atmospheric panel */}
              <div className="lg:col-span-5">
                <div
                  aria-label="Fleet summary"
                  className="ember-atmosphere h-full overflow-hidden rounded-xl border border-border p-5 sm:p-6 flex flex-col gap-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-medium text-ink">Fleet</span>
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent/[0.12] px-2.5 py-0.5 text-xs font-medium text-accent">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                      Live
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { label: "Workspaces", value: totalProjects, icon: <Layers size={14} /> },
                      { label: "Active", value: activeCount, icon: <Activity size={14} /> },
                      { label: "Shipped", value: completedCount, icon: <CheckCircle2 size={14} /> },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-border bg-base/40 p-3 backdrop-blur-[5px]"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
                          {stat.icon}
                        </span>
                        <p className="mt-2.5 text-xs text-muted">{stat.label}</p>
                        <p className="font-mono text-title tabular text-ink">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <ul className="space-y-2" aria-label="Agent roster">
                    {AGENTS.map((agent) => {
                      const Icon = agent.icon;
                      return (
                        <li key={agent.id} className="flex items-center gap-2.5 text-caption">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-md bg-ink/[0.06] ${AGENT_TONE[agent.id] ?? "text-muted"}`}
                          >
                            <Icon size={13} />
                          </span>
                          <span className="flex-1 text-ink">{agent.label}</span>
                          <span className="font-mono text-xs tabular text-faint">{agent.credits} cr/run</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>

            {/* Inline Repository Import Bar */}
            {showImport && (
              <section
                aria-label="Import Repository"
                className="bg-panel rounded-xl p-5 border border-border transition"
              >
                <form
                  onSubmit={handleRepoImport}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                >
                  <div className="flex-1 relative">
                    <FolderGit2
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <input
                      type="url"
                      value={importRepoUrl}
                      onChange={(e) => setImportRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-panel text-sm font-mono text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-border"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="submit"
                      disabled={isImporting}
                      className="h-11 px-6 bg-ink hover:bg-ink text-on-ink font-semibold text-xs rounded-pill transition cursor-pointer disabled:opacity-50"
                    >
                      {isImporting ? "Importing…" : "Import"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowImport(false)}
                      className="h-11 px-4 text-xs font-semibold text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* =========================================================================
                2. WORKSPACE SYNTHESIZER WORKBENCH (IDENTICAL TO PRD SYNTHESIZER)
            ========================================================================= */}
            <section
              id="workspace-synthesizer"
              aria-label="Workspace Synthesizer Workbench"
              className="bg-panel rounded-xl p-5 sm:p-6 border border-border space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink/[0.06] text-ink">
                    <Sparkles size={15} />
                  </span>
                  <span className="text-title text-ink">
                    Autonomous Workspace Synthesizer
                  </span>
                </div>

                <div className="flex items-center gap-2 text-caption text-muted">
                  <Cpu size={13} className="text-ok" />
                  <span>Gemini 3.8 Flash Online</span>
                  <span className="text-faint" aria-hidden="true">·</span>
                  <span>Deterministic Multi-Agent Pipeline</span>
                </div>
              </div>

              {/* Form input line */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleScaffoldFromInput();
                }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-2xl border border-glass-border bg-glass p-2 backdrop-blur-[5px] transition focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="scaffold new stack, feature branch, or test suite... (e.g. 'Event-driven payment clearing service')"
                  aria-label="scaffold new stack, feature branch, or test suite…"
                  className="flex-1 bg-transparent px-3 py-2 text-body text-ink placeholder:text-faint focus:outline-none focus-visible:outline-none min-w-0"
                />

                <div className="flex items-center gap-2 shrink-0">
                  <VoiceInputButton
                    id="voice-workspace-prompt"
                    label="Voice Input"
                    currentValue={promptInput}
                    onTextCaptured={(spokenText) => setPromptInput(spokenText)}
                    variant="button"
                  />

                  <button
                    type="button"
                    onClick={handleExpandIdeas}
                    disabled={isExpandingIdeas || !promptInput.trim()}
                    className="h-9 px-4 rounded-pill border border-glass-border bg-glass text-ink hover:bg-ink/10 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Lightbulb size={13} />
                    <span>{isExpandingIdeas ? "Expanding…" : "Expand Ideas"}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isAiGenerating || !promptInput.trim()}
                    aria-label="Synthesize Workspace"
                    className="h-9 px-5 bg-ink hover:bg-ink/90 text-on-ink font-medium text-xs rounded-pill transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={13} strokeWidth={2.4} />
                    <span>{isAiGenerating ? "Synthesizing…" : "Synthesize Workspace ↵"}</span>
                  </button>
                </div>
              </form>

              {/* Quick Recipe Chips */}
              <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1 scrollbar-none">
                <span className="text-xs text-faint shrink-0">
                  Quick starters
                </span>
                {[
                  "Distributed Rate Limiter in Go",
                  "FinTech Double-Entry Ledger",
                  "Clinical Healthcare EHR",
                  "Real-time Whiteboard Canvas",
                  "High-Throughput Matching Engine",
                ].map((recipe) => (
                  <button
                    key={recipe}
                    type="button"
                    onClick={() => {
                      handleSound();
                      setPromptInput(recipe);
                      handleExpandIdeasWithPrompt(recipe);
                    }}
                    className="shrink-0 px-3 py-1 rounded-pill border border-border-soft bg-ink/[0.04] text-muted hover:text-ink hover:bg-ink/[0.08] transition cursor-pointer text-xs"
                  >
                    {recipe}
                  </button>
                ))}
              </div>

              {/* Live Generating Signal */}
              {isAiGenerating && (
                <div className="p-4 rounded-lg bg-accent/[0.06] border border-accent/20 flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2 font-medium text-accent">
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none" />
                    <span>{aiPhase || "8 Autonomous Specialist Agents Active..."}</span>
                  </span>
                  <span className="text-muted text-[11px]">
                    Deterministic Architectural Decomposition · Gemini 3.8 Flash
                  </span>
                </div>
              )}

              {/* Expanded Ideas Proposals */}
              {showExpandedIdeasPanel && expandedIdeas && (
                <div className="mt-4 pt-4 border-t border-border-soft space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-agent-business-improver" />
                      <h4 className="text-caption font-medium text-ink">
                        Gemini 3.8 Architectural Proposals
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowExpandedIdeasPanel(false)}
                      className="text-xs font-semibold text-faint hover:text-muted"
                    >
                      Dismiss
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {expandedIdeas.map((idea) => (
                      <div
                        key={idea.id}
                        className="p-4 rounded-lg bg-panel-alt border border-border hover:border-ink/20 transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="px-2 py-0.5 rounded-pill text-[11px] font-medium bg-accent/[0.12] text-accent">
                              {idea.archetype}
                            </span>
                            <span className="text-[11px] font-semibold text-ok">
                              {idea.estimatedSla}
                            </span>
                          </div>
                          <h5 className="text-sm font-semibold text-ink line-clamp-1">
                            {idea.title}
                          </h5>
                          <p className="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">
                            {idea.summary}
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {idea.recommendedStack.map((tech) => (
                              <span
                                key={tech}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-panel border border-border text-ink"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleScaffoldWithIdea(idea)}
                          className="mt-3 w-full h-9 border border-glass-border bg-glass hover:bg-ink/10 text-ink text-xs font-medium rounded-pill transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Scaffold Architecture</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* =========================================================================
                3. REPOSITORY SECTION (IDENTICAL TO INITIATIVES REPOSITORY)
            ========================================================================= */}
            <section
              id="workspaces-repository"
              aria-label="Workspaces library"
              className="space-y-6"
            >
              {/* Header & Controls Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-title text-ink">
                    Workspace Repository
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-pill bg-ink/[0.06] text-muted text-xs">
                    <span className="font-mono tabular text-ink">{visibleProjects.length}</span> Workspaces
                  </span>
                </div>

                {/* Filter controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search Bar */}
                  <div className="relative min-w-[220px]">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search library…"
                      aria-label="Search workspaces"
                      className="h-9 w-full rounded-pill border border-glass-border bg-glass pl-9 pr-3 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                    />
                  </div>

                  {/* Status Filter Buttons */}
                  <div className="flex items-center gap-0.5 bg-ink/[0.06] p-1 rounded-pill">
                    {(
                      [
                        { id: "all", label: `All (${totalProjects})` },
                        { id: "active", label: `Active (${activeCount})` },
                        { id: "complete", label: `Done (${completedCount})` },
                        { id: "failed", label: "Failed" },
                      ] as const
                    ).map((filter) => {
                      const isActive = statusFilter === filter.id;
                      return (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => {
                            handleSound();
                            setStatusFilter(filter.id);
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-pill transition-all cursor-pointer whitespace-nowrap ${
                            isActive
                              ? "bg-ink text-on-ink"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Accessible hidden select for tests */}
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(e) => {
                      handleSound();
                      setStatusFilter(e.target.value as ProjectStatusFilter);
                    }}
                    className="sr-only"
                  >
                    <option value="all">FILTER: ALL</option>
                    <option value="active">FILTER: ACTIVE</option>
                    <option value="complete">FILTER: COMPLETED</option>
                    <option value="failed">FILTER: FAILED</option>
                  </select>

                  {/* Sort dropdown */}
                  <select
                    value={sortKey}
                    onChange={(e) => {
                      handleSound();
                      setSortKey(e.target.value as SortKey);
                    }}
                    aria-label="Sort by"
                    className="h-9 rounded-pill border border-glass-border bg-glass px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
                  >
                    <option value="recent">Recent</option>
                    <option value="name">Name</option>
                    <option value="status">Sort by Status</option>
                  </select>

                  {/* View Mode Toggle */}
                  <div
                    className="flex items-center gap-0.5 bg-ink/[0.06] p-1 rounded-pill"
                    role="group"
                    aria-label="View mode"
                  >
                    <button
                      type="button"
                      title="Grid view"
                      onClick={() => {
                        handleSound();
                        setViewMode("grid");
                      }}
                      aria-label="Icon view"
                      aria-pressed={viewMode === "grid"}
                      className={`h-7 w-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                        viewMode === "grid"
                          ? "bg-ink text-on-ink"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <LayoutGrid size={14} aria-hidden="true" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      title="Dense table view"
                      onClick={() => {
                        handleSound();
                        setViewMode("table");
                      }}
                      aria-label="List view"
                      aria-pressed={viewMode === "table"}
                      className={`h-7 w-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                        viewMode === "table"
                          ? "bg-ink text-on-ink"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <List size={14} aria-hidden="true" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Content Area based on Tab & ViewMode */}
              {activeTab === "repos" ? (
                <div className="bg-panel rounded-xl p-5 sm:p-6 border border-border space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border-soft">
                    <h3 className="text-base font-semibold text-ink">
                      Connected Source Repositories
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowImport(true)}
                      className="px-4 py-1.5 bg-ink text-on-ink rounded-full text-xs font-semibold"
                    >
                      + Connect Repository
                    </button>
                  </div>
                  <div className="space-y-3">
                    {[
                      {
                        name: "forge-ai/forge-engine",
                        branch: "main",
                        status: "Clean · Sync",
                        lastSync: "12m ago",
                      },
                      {
                        name: "forge-ai/auth-service",
                        branch: "feat/pkce-v2",
                        status: "+14 -3 modified",
                        lastSync: "1h ago",
                      },
                      {
                        name: "forge-ai/telemetry-pipeline",
                        branch: "main",
                        status: "Clean · Sync",
                        lastSync: "4h ago",
                      },
                    ].map((repo) => (
                      <div
                        key={repo.name}
                        className="flex items-center justify-between p-4 rounded-lg bg-panel-alt border border-border-soft"
                      >
                        <div className="flex items-center gap-3">
                          <FolderGit2 size={18} className="text-accent" />
                          <div>
                            <h4 className="text-sm font-semibold text-ink">
                              {repo.name}
                            </h4>
                            <span className="text-xs text-muted">
                              branch: <code className="font-mono">{repo.branch}</code>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-ok/10 text-ok font-semibold">
                            {repo.status}
                          </span>
                          <span className="text-faint">Synced {repo.lastSync}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeTab === "deployments" ? (
                <div className="bg-panel rounded-xl p-5 sm:p-6 border border-border space-y-4">
                  <h3 className="text-base font-semibold text-ink pb-3 border-b border-border-soft">
                    Live Edge Deployments
                  </h3>
                  <div className="space-y-3">
                    {DEPLOYMENTS.map((dep) => (
                      <div
                        key={dep.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-panel-alt border border-border-soft gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-ok" />
                            <h4 className="text-sm font-semibold text-ink">
                              {dep.project}
                            </h4>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-high text-ink">
                              {dep.environment}
                            </span>
                          </div>
                          <a
                            href={dep.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-mono text-accent hover:underline flex items-center gap-1 mt-1"
                          >
                            <span>{dep.url}</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium text-muted">
                          <span>{dep.region}</span>
                          <span className="text-ok font-semibold">{dep.uptime}</span>
                          <span>{dep.latency}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeTab === "activity" ? (
                <div className="bg-panel rounded-xl p-5 sm:p-6 border border-border space-y-4">
                  <h3 className="text-base font-semibold text-ink pb-3 border-b border-border-soft">
                    Autonomous Fleet Audit Stream
                  </h3>
                  <div className="space-y-3">
                    {ACTIVITIES.map((act) => (
                      <div
                        key={act.id}
                        className="flex items-start justify-between p-4 rounded-lg bg-panel-alt border border-border-soft gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${act.badgeColor}`}>
                              {act.badge}
                            </span>
                            <span className="text-xs font-semibold text-ink">
                              {act.agent}
                            </span>
                            <span className="text-xs text-faint">• {act.project}</span>
                          </div>
                          <p className="text-xs text-ink leading-relaxed">
                            {act.action}
                          </p>
                        </div>
                        <span className="text-xs text-faint shrink-0">{act.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : viewMode === "table" ? (
                /* Dense Engineering Table View */
                <div className="bg-panel rounded-xl p-2 border border-border overflow-x-auto">
                  <table role="table" className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Workspace</th>
                        <th className="py-3 px-4">Tech Stack</th>
                        <th className="py-3 px-4">QA Score</th>
                        <th className="py-3 px-4">Agents</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft text-xs">
                      {visibleProjects.map((p) => {
                        const badge = getStatusBadge(p.status || (p.live ? "live" : "ready"));
                        const isPinned = pinnedIds.includes(p.id);
                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-ink/5 transition group"
                          >
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-ink">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => handleTogglePin(p.id, e)}
                                  className="text-faint hover:text-warn"
                                >
                                  <Pin size={13} className={isPinned ? "fill-warn text-warn" : ""} />
                                </button>
                                <div>
                                  <div className="font-semibold text-sm text-ink group-hover:text-accent transition">
                                    {p.displayName || p.name}
                                  </div>
                                  <div className="text-[11px] text-muted truncate max-w-xs">
                                    {p.description}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {p.techStack?.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-panel-alt text-ink"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-ink">
                              {p.qaScore ?? 92}/100
                            </td>
                            <td className="py-3.5 px-4 text-muted">
                              {p.agents?.join(", ") || "Full Fleet"}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleAudit(p)}
                                  aria-label="Audit"
                                  className="h-7 px-2.5 rounded-full border border-border text-ink hover:bg-ink/5 font-semibold text-xs"
                                >
                                  Audit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/p/${p.id}/workspace`)}
                                  className="h-7 px-3 bg-ink text-on-ink rounded-full font-semibold text-xs"
                                >
                                  Open IDE
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* List rows (dashboard "Active Projects" pattern) */
                <motion.ul
                  variants={gridVariants}
                  initial="hidden"
                  animate="show"
                  aria-label="Workspaces"
                  className="flex flex-col gap-2.5"
                >
                  {visibleProjects.map((p) => {
                    const badge = getStatusBadge(p.status || (p.live ? "live" : "ready"));
                    const isPinned = pinnedIds.includes(p.id);
                    const progress = Math.max(0, Math.min(100, p.qaScore ?? 94));
                    const stackCount = p.techStack?.length ?? 0;
                    const agentCount = p.agents?.length ?? 0;
                    const openWorkspace = () => {
                      handleSound();
                      navigate(`/p/${p.id}/workspace`);
                    };

                    return (
                      <motion.li key={p.id} variants={itemVariants}>
                        <div className="group grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-panel p-3.5 sm:p-4 transition-colors hover:border-ink/20 hover:bg-panel-alt md:grid-cols-[56px_minmax(0,1.5fr)_minmax(160px,1fr)_auto]">
                          <div
                            aria-hidden="true"
                            className="h-14 w-14 rounded-lg border border-border-soft"
                            style={{ background: atmosphereSwatch(p.id) }}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="min-w-0 truncate text-body font-medium text-ink">
                                <button
                                  type="button"
                                  onClick={openWorkspace}
                                  className="max-w-full truncate text-left cursor-pointer hover:underline underline-offset-4"
                                >
                                  {p.displayName || p.name}
                                </button>
                              </h3>
                              <button
                                type="button"
                                onClick={(e) => handleTogglePin(p.id, e)}
                                className={`shrink-0 rounded-md p-1 transition cursor-pointer ${
                                  isPinned ? "text-accent" : "text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink"
                                }`}
                                title={isPinned ? "Unpin workspace" : "Pin workspace"}
                              >
                                <Pin size={13} className={isPinned ? "fill-current" : ""} />
                              </button>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-caption text-muted">
                              {p.description || "Production-ready decoupled microservice architecture."}
                            </p>
                          </div>

                          <div className="col-span-2 min-w-0 md:col-span-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted">QA</span>
                              <span className="font-mono tabular text-ink">{progress}%</span>
                            </div>
                            <div
                              className="mt-1.5 h-1 w-full overflow-hidden rounded-pill bg-ink/[0.08]"
                              role="progressbar"
                              aria-valuenow={progress}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`QA score for ${p.displayName || p.name}`}
                            >
                              <div
                                className={`h-full rounded-pill ${progress >= 90 ? "bg-ok" : progress >= 75 ? "bg-warn" : "bg-error"}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="mt-1.5 truncate text-xs text-faint">
                              {stackCount > 0 && (
                                <>
                                  <span className="font-mono tabular">{stackCount}</span> stack
                                  <span aria-hidden="true"> · </span>
                                </>
                              )}
                              <span className="font-mono tabular">{agentCount || 8}</span> agents
                              <span aria-hidden="true"> · </span>
                              Updated {formatRelativeTime(p.lastBuilt)}
                            </p>
                          </div>

                          <div className="col-span-2 flex flex-row-reverse items-center justify-between gap-3 md:col-span-1 md:flex-row md:justify-end">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label="Audit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAudit(p);
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-pill border border-glass-border bg-glass px-3 text-xs font-medium text-ink transition hover:bg-ink/10 cursor-pointer"
                              >
                                <ShieldCheck size={12} className="text-muted" />
                                <span>Audit</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openWorkspace();
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-pill px-3 text-xs font-medium text-muted transition hover:bg-ink/[0.06] hover:text-ink cursor-pointer"
                              >
                                <span>Open IDE</span>
                                <ArrowRight size={13} />
                              </button>
                            </div>
                            <span
                              className={`inline-flex w-[76px] items-center justify-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium ${badge.bg}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </section>
          </div>
        </SuiWindowFrame>
      </div>

      {/* =========================================================================
          NEW PROJECT MODAL (WITH AI ARCHITECT & MANUAL MODES)
      ========================================================================= */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 bg-base/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-panel rounded-3xl border border-border p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border-soft pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-warn" />
                <h3 className="text-lg font-semibold text-ink">
                  {dialogTab === "ai" ? "Gemini AI Architect" : "New Engineering Workspace"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewDialog(false)}
                className="text-faint hover:text-muted"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dialog tabs */}
            <div className="flex items-center gap-2 bg-panel-alt p-1 rounded-full text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDialogTab("ai")}
                className={`flex-1 py-1.5 rounded-full transition ${
                  dialogTab === "ai"
                    ? "bg-panel text-ink shadow-xs"
                    : "text-muted"
                }`}
              >
                AI Synthesis Mode
              </button>
              <button
                type="button"
                onClick={() => setDialogTab("manual")}
                className={`flex-1 py-1.5 rounded-full transition ${
                  dialogTab === "manual"
                    ? "bg-panel text-ink shadow-xs"
                    : "text-muted"
                }`}
              >
                Manual Blueprint
              </button>
            </div>

            {dialogTab === "ai" ? (
              <div className="space-y-4">
                <p className="text-xs text-muted leading-relaxed">
                  Describe what you want to build. Gemini 3.8 Flash will infer the optimal domain models, API schemas, and architecture contracts.
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="scaffold new stack, feature branch, or test suite... (e.g. 'Distributed rate limiter in Go with Redis sliding window')"
                  rows={4}
                  className="w-full p-3 rounded-2xl border border-border bg-panel text-xs font-mono text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-border"
                />

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted font-medium">
                    Fleet: Architect · Builder · QA · DevOps
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewDialog(false)}
                      className="px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isAiGenerating || !aiPrompt.trim()}
                      onClick={() => handleScaffoldWithGemini()}
                      aria-label="Generate Blueprint"
                      className="px-6 py-2 bg-ink hover:bg-ink text-on-ink text-xs font-semibold rounded-full transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Sparkles size={13} />
                      <span>{isAiGenerating ? "Synthesizing…" : "Generate Blueprint"}</span>
                    </button>
                  </div>
                </div>

                {generatedPreview && (
                  <div className="p-3 bg-ok/10 border border-ok/30 rounded-xl text-xs flex items-center justify-between">
                    <span className="font-semibold text-ok">
                      Generated: {generatedPreview.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewDialog(false);
                        navigate(`/p/${generatedPreview.id}/workspace`);
                      }}
                      className="text-xs font-semibold text-ok hover:underline"
                    >
                      Launch Workspace →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreateManual} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. payment-service"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-panel text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-border"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Architecture Archetype
                  </label>
                  <select
                    value={newProjectTemplate}
                    onChange={(e) => setNewProjectTemplate(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-panel text-xs font-semibold text-ink focus:outline-none"
                  >
                    <option value="saas">Modular Full-Stack SaaS (React + Vite + Node)</option>
                    <option value="api">High-Throughput Microservice (Go / Hono + Redis)</option>
                    <option value="data">Data Pipeline & Analytics (Python + FastAPI)</option>
                  </select>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewDialog(false)}
                    className="px-4 py-2 text-xs font-semibold text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-ink hover:bg-ink text-on-ink text-xs font-semibold rounded-full transition"
                  >
                    Create Workspace
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          GEMINI DEEP ARCHITECTURE AUDIT DRAWER / MODAL
      ========================================================================= */}
      {auditProject && (
        <div className="fixed inset-0 z-50 bg-base/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-panel rounded-3xl border border-border p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-soft pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-ok" />
                <div>
                  <h3 className="text-base font-semibold text-ink">
                    Gemini Architecture & Security Audit
                  </h3>
                  <p className="text-xs text-muted">
                    Target: {auditProject.displayName || auditProject.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuditProject(null)}
                className="text-faint hover:text-muted"
              >
                <X size={18} />
              </button>
            </div>

            {isAuditing ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <span className="h-8 w-8 rounded-full border-2 border-ok/30 border-t-transparent animate-spin" />
                <span className="text-xs font-semibold text-muted">
                  Running Gemini 3.8 Deep System Audit & Vulnerability Assessment…
                </span>
              </div>
            ) : auditResult ? (
              <div className="space-y-4 text-xs">
                {/* Executive Summary */}
                <div className="p-4 rounded-2xl bg-panel border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink uppercase tracking-wider text-[10px]">
                      Executive Verdict
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-ok/10 text-ok font-semibold text-xs">
                      Grade: {auditResult.architectureGrade}
                    </span>
                  </div>
                  <p className="text-ink leading-relaxed font-medium">
                    {auditResult.executiveSummary}
                  </p>
                </div>

                {/* Score Pills */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-panel border border-border text-center">
                    <span className="text-[10px] text-muted uppercase font-semibold block">
                      Security
                    </span>
                    <span className="text-lg font-semibold text-ok">
                      {auditResult.securityScore}%
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-panel border border-border text-center">
                    <span className="text-[10px] text-muted uppercase font-semibold block">
                      Scalability
                    </span>
                    <span className="text-lg font-semibold text-accent">
                      {auditResult.scalabilityScore}%
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-panel border border-border text-center">
                    <span className="text-[10px] text-muted uppercase font-semibold block">
                      Reliability
                    </span>
                    <span className="text-lg font-semibold text-agent-business-improver">
                      {auditResult.reliabilityScore}%
                    </span>
                  </div>
                </div>

                {/* Suggested Enhancements */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Recommended Enhancements
                  </h4>
                  {auditResult.suggestedEnhancements.map((enh, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-panel border border-border flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-ink">
                          {enh.title}
                        </div>
                        <div className="text-muted text-[11px]">{enh.impact}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-high text-ink">
                        {enh.effort} effort
                      </span>
                    </div>
                  ))}
                </div>

                {/* Agent Directives */}
                <div className="p-3 rounded-xl bg-info/10 border border-info/30 space-y-1.5">
                  <span className="font-semibold text-accent uppercase tracking-wider text-[10px]">
                    Autonomous Fleet Directives
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-accent">
                    <div>
                      <strong>Architect:</strong> {auditResult.agentDirectives.architect}
                    </div>
                    <div>
                      <strong>QA:</strong> {auditResult.agentDirectives.qa}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAuditProject(null)}
                className="px-6 py-2 bg-ink hover:bg-ink text-on-ink text-xs font-semibold rounded-full transition"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
