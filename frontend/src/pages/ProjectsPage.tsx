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
  Star,
  Tag,
  Kanban,
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
import { LIVE_MODE } from "../lib/env";
import { fromApiProject, type ApiProject } from "../lib/projectAdapter";
import { useQueryClient } from "@tanstack/react-query";
import { PROJECTS_QUERY_KEY } from "../hooks/useActiveProject";
import {
  scaffoldProjectWithGemini,
  analyzeProjectWithGemini,
  expandProjectIdeaWithGemini,
  type ProjectAnalysis,
  type IdeaOption,
} from "../lib/geminiProject";
import { formatRelativeTime } from "../lib/format";
import { coverGradient } from "../lib/coverArt";
import { motion } from "../lib/animations";
import { SuiWindowFrame, BottomNavItem } from "../components/pm/SuiWindowFrame";
import { SuiKeycapVisual } from "../components/pm/SuiKeycapVisual";
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
 badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800",
 time: "15m ago",
  },
  {
 id: "act-2",
 action: "Executed regression test suite (42/42 assertions passed, 0 flakiness)",
 project: "Identity Gateway",
 agent: "QA Specialist",
 badge: "TEST",
 badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
 time: "1h ago",
  },
  {
 id: "act-3",
 action: "Auto-scaled edge cluster replicas to 5 regions across Tokyo, Frankfurt, N.Virginia",
 project: "Telemetry Pipeline",
 agent: "DevOps Agent",
 badge: "SCALE",
 badgeColor: "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-300 dark:border-sky-800",
 time: "4h ago",
  },
  {
 id: "act-4",
 action: "Synthesized Zod API contracts and runtime JSON schema validator",
 project: "Forge Core Engine",
 agent: "Architect Agent",
 badge: "SCHEMA",
 badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800",
 time: "6h ago",
  },
];

function getStatusBadge(status?: string) {
 const s = (status || "ready").toLowerCase();
 if (s === "generating" || s === "planning" || s === "building") {
    return {
 label: "Building",
 bg: "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800",
 dot: "bg-blue-600 animate-ping",
    };
  }
 if (s === "live" || s === "active") {
    return {
 label: "Live",
 bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
 dot: "bg-emerald-500 animate-pulse",
    };
  }
 if (s === "ready" || s === "completed" || s === "done") {
    return {
 label: "Ready",
 bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
 dot: "bg-emerald-500",
    };
  }
 if (s === "failed") {
    return {
 label: "Failed",
 bg: "bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800",
 dot: "bg-rose-500",
    };
  }
  return {
 label: "Active",
 bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
 dot: "bg-emerald-500",
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

  // Live mode: the backend is the only source of truth for projects.
 // Demo mode (no backend): localStorage "custom" projects + bundled mocks.
  const [customProjects, setCustomProjects] = useState<Project[]>(() =>
    LIVE_MODE ? [] : getCustomProjects()
  );
  const [apiProjects, setApiProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(LIVE_MODE);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const loadProjects = React.useCallback(() => {
    if (!LIVE_MODE) return;
    setProjectsLoading(true);
    setProjectsError(null);
    projectsApi
      .list()
      .then((data: ApiProject[]) => {
        setApiProjects(Array.isArray(data) ? data.map(fromApiProject) : []);
      })
      .catch((err: any) => {
 setProjectsError(err?.response?.data?.detail || "Could not load your projects.");
      })
      .finally(() => setProjectsLoading(false));
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Persist a project to the backend and return the server-issued record.
  const createBackendProject = async (data: {
    name: string;
    description: string;
    template?: string;
  }): Promise<Project> => {
    const created: ApiProject = await projectsApi.create({
      name: data.name,
      description: data.description || data.name,
      template: data.template,
    });
    const proj = fromApiProject(created);
    setApiProjects((prev) => [proj, ...prev.filter((p) => p.id !== proj.id)]);
    // Keep the nav's project switcher in sync with the new project.
    queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    return proj;
  };

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
    const combined = LIVE_MODE ? apiProjects : [...customProjects, ...MOCK_PROJECTS];
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
      const importedId = res?.project?.id || res?.project_id || res?.id;
      loadProjects();
      if (importedId) navigate(`/p/${importedId}/workspace`);
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
      if (LIVE_MODE) {
        // Replace the client-side id with the real backend project so the
        // workspace, builds and initiatives all resolve against the API.
        const persisted = await createBackendProject({
          name: scaffolded.displayName || scaffolded.name,
          description: scaffolded.description || effectivePrompt,
          template: scaffolded.template,
        });
        const merged = { ...scaffolded, id: persisted.id };
        setGeneratedPreview(merged);
        setApiProjects((prev) => [
          { ...persisted, techStack: scaffolded.techStack, architectureOverview: scaffolded.architectureOverview },
          ...prev.filter((p) => p.id !== persisted.id),
        ]);
      } else {
        saveCustomProject(scaffolded);
        setCustomProjects((prev) => [scaffolded, ...prev.filter((p) => p.id !== scaffolded.id)]);
      }
 toast.success("Workspace scaffolded");
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
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
 handleSound("click");
    if (LIVE_MODE) {
      try {
        const proj = await createBackendProject({
          name: newProjectName.trim(),
          description: `${newProjectTemplate} project`,
          template: newProjectTemplate,
        });
        toast.success(`Created workspace ${proj.displayName}`);
        setShowNewDialog(false);
 setNewProjectName("");
        navigate(`/p/${proj.id}/workspace`);
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
 toast.error(typeof detail === "string" ? detail : "Could not create the project.");
      }
      return;
    }
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
        badge: LIVE_MODE ? undefined : 3,
 isActive: activeTab === "repos",
        onClick: () => {
          handleSound();
 setActiveTab("repos");
        },
      },
      {
 id: "deployments",
 label: "Edge Deployments",
        badge: LIVE_MODE ? undefined : DEPLOYMENTS.length,
 isActive: activeTab === "deployments",
        onClick: () => {
          handleSound();
 setActiveTab("deployments");
        },
      },
      {
 id: "activity",
 label: "Fleet Activity",
        badge: LIVE_MODE ? undefined : ACTIVITIES.length,
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
 <div className="relative min-h-screen w-full bg-[#E5EEF8] dark:bg-[#07090E] p-1.5 sm:p-3 md:p-4 font-sans antialiased text-[#111827] dark:text-[#F3F4F6] transition-colors duration-200 flex flex-col items-stretch justify-start">
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
 icon: <Sparkles size={14} className="text-amber-400" />,
            onClick: () => {
              handleSound();
              setShowNewDialog(true);
            },
          }}
        >
 <div className="space-y-8 sm:space-y-10">
            {/* =========================================================================
                1. HERO SECTION: SUI OVERFLOW AESTHETIC (IDENTICAL TO INITIATIVE PAGE)
            ========================================================================= */}
            <section
 aria-label="Workspaces Hero"
 className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2"
            >
              {/* Left Column: Bold Typography & Signature Paired CTA */}
 <div className="lg:col-span-7 space-y-5">
                <div>
 <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-neutral-950 dark:text-white leading-[1.08]">
                    Engineering Workspaces
                  </h1>
 <p className="mt-2 text-base sm:text-lg font-semibold text-neutral-700 dark:text-neutral-300">
                    Production Software · Autonomous Multi-Agent Fleet
                  </p>
                </div>

 <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-300 max-w-xl leading-relaxed">
                  Autonomous multi-agent orchestration: plan, build, verify, and deploy production software from high-level architectural briefs. 8 specialist AI agents collaborate across deterministic code generation, tests, and CI/CD.
                </p>

                {/* Signature Sui Overflow Paired CTA Unit */}
 <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Primary Black Rectangular Button */}
                  <button
 type="button"
                    onClick={() => {
                      handleSound();
                      inputRef.current?.focus();
 const el = document.getElementById("workspace-synthesizer");
 el?.scrollIntoView({ behavior: "smooth" });
                    }}
 className="h-11 sm:h-12 px-7 sm:px-8 bg-[#1A1A1A] hover:bg-black text-white rounded-lg text-sm sm:text-base font-bold tracking-tight shadow-m3 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Scaffold Workspace</span>
                  </button>

                  {/* Adjacent Sky-Blue Square Button with Arrow */}
                  <button
 type="button"
                    onClick={() => {
 handleSound("switch");
                      openAiDialog();
                    }}
 className="h-11 sm:h-12 w-11 sm:w-12 bg-[#D7E9FE] hover:bg-[#BAE6FD] text-neutral-900 border border-border rounded-lg shadow-m3 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer"
 title="Launch Architect"
 aria-label="Launch Architect"
                  >
                    <ArrowUpRight size={20} strokeWidth={2.6} />
                  </button>

                  {/* Import Repo Button */}
                  <button
 type="button"
                    onClick={() => {
                      handleSound();
                      setShowImport((prev) => !prev);
                    }}
 className="h-11 sm:h-12 px-4 sm:px-5 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 border border-border rounded-lg text-sm font-bold shadow-m3 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <FolderGit2 size={16} />
                    <span>Import Repo</span>
                  </button>

                  {/* GEMINI AI Button */}
                  <button
 type="button"
                    onClick={() => {
 handleSound("switch");
                      openAiDialog();
                    }}
 className="h-11 sm:h-12 px-4 sm:px-5 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-black border border-border rounded-lg text-sm font-black shadow-m3 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                  >
 <Sparkles size={16} className="text-black" />
                    <span>GEMINI AI</span>
                  </button>
                </div>

                {/* Micro Stats Row */}
 <div className="flex flex-wrap items-center gap-3 pt-2">
 <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white dark:bg-neutral-800 border border-neutral-900/15 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
 <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>8 Specialist Agents Active</span>
                  </div>
 <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white dark:bg-neutral-800 border border-neutral-900/15 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
 <Star size={13} className="text-amber-500 fill-amber-500" />
                    <span>Multi-Agent Fleet</span>
                  </div>
 <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white dark:bg-neutral-800 border border-neutral-900/15 text-xs font-semibold text-blue-600 dark:text-blue-400">
 <Sparkles size={13} className="text-amber-500" />
                    <span>Gemini 3.8 Flash Online</span>
                  </div>
                </div>
              </div>

              {/* Right Column: 3D Candy Keycaps & Cursors Graphic */}
 <div className="lg:col-span-5 flex justify-center">
 <div className="w-full max-w-[440px] bg-white/80 dark:bg-neutral-900/60 rounded-2xl border border-border p-4 shadow-m3">
                  <SuiKeycapVisual
 title="OVERFLOW"
                    onKeyClick={(char) => {
                      synth.playClick(600);
                      toast(`Specialist ${char} Assigned · Ready to build`);
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Inline Repository Import Bar */}
            {showImport && (
              <section
 aria-label="Import Repository"
 className="bg-white dark:bg-[#141722] rounded-3xl p-5 border border-neutral-200/90 dark:border-neutral-800 shadow-sm transition"
              >
                <form
                  onSubmit={handleRepoImport}
 className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                >
 <div className="flex-1 relative">
                    <FolderGit2
                      size={16}
 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
                    />
                    <input
 type="url"
                      value={importRepoUrl}
                      onChange={(e) => setImportRepoUrl(e.target.value)}
 placeholder="https://github.com/owner/repo"
 className="w-full h-11 pl-10 pr-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0E1017] text-sm font-mono text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                      required
                    />
                  </div>
 <div className="flex items-center gap-2 shrink-0">
                    <button
 type="submit"
                      disabled={isImporting}
 className="h-11 px-6 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
 {isImporting ? "Importing…" : "Import"}
                    </button>
                    <button
 type="button"
                      onClick={() => setShowImport(false)}
 className="h-11 px-4 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
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
 className="bg-white dark:bg-[#141722] rounded-3xl p-5 sm:p-6 border border-neutral-200/90 dark:border-neutral-800 shadow-sm space-y-4"
            >
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800/80 pb-3">
 <div className="flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Sparkles size={15} />
                  </span>
 <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                    Autonomous Workspace Synthesizer
                  </span>
                </div>

 <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
 <Cpu size={13} className="text-emerald-500" />
                  <span>Gemini 3.8 Flash Online</span>
                  <span>•</span>
 <span className="text-blue-600 dark:text-blue-400 font-bold">
                    Deterministic Multi-Agent Pipeline
                  </span>
                </div>
              </div>

              {/* Form input line */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleScaffoldFromInput();
                }}
 className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-neutral-50 dark:bg-[#0E1017] p-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 focus-within:border-neutral-400 dark:focus-within:border-neutral-600 transition"
              >
                <input
                  ref={inputRef}
 type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
 placeholder="scaffold new stack, feature branch, or test suite... (e.g. 'Event-driven payment clearing service')"
 aria-label="scaffold new stack, feature branch, or test suite…"
 className="flex-1 bg-transparent px-3 py-2 text-sm font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none min-w-0"
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
 className="h-10 px-4 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-full border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                  >
                    <Lightbulb size={13} />
 <span>{isExpandingIdeas ? "Expanding…" : "Expand Ideas"}</span>
                  </button>

                  <button
 type="submit"
                    disabled={isAiGenerating || !promptInput.trim()}
 aria-label="Synthesize Workspace"
 className="h-10 px-6 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs rounded-full shadow-sm transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={13} strokeWidth={2.4} />
 <span>{isAiGenerating ? "Synthesizing…" : "Synthesize Workspace ↵"}</span>
                  </button>
                </div>
              </form>

              {/* Quick Recipe Chips */}
 <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1 scrollbar-none">
 <span className="font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider text-[11px] shrink-0">
                  Quick Starters:
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
 className="shrink-0 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-medium transition cursor-pointer text-xs"
                  >
                    {recipe}
                  </button>
                ))}
              </div>

              {/* Live Generating Signal */}
              {isAiGenerating && (
 <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-center justify-between gap-3 text-xs">
 <span className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-200">
 <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
 <span>{aiPhase || "8 Autonomous Specialist Agents Active..."}</span>
                  </span>
 <span className="text-blue-600 dark:text-blue-400 font-medium text-[11px]">
                    Deterministic Architectural Decomposition · Gemini 3.8 Flash
                  </span>
                </div>
              )}

              {/* Expanded Ideas Proposals */}
              {showExpandedIdeasPanel && expandedIdeas && (
 <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Sparkles size={14} className="text-purple-600 dark:text-purple-400" />
 <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
                        Gemini 3.8 Architectural Proposals
                      </h4>
                    </div>
                    <button
 type="button"
                      onClick={() => setShowExpandedIdeasPanel(false)}
 className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      Dismiss
                    </button>
                  </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {expandedIdeas.map((idea) => (
                      <div
                        key={idea.id}
 className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 hover:border-purple-300 dark:hover:border-purple-700 transition flex flex-col justify-between"
                      >
                        <div>
 <div className="flex items-center justify-between mb-2">
 <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              {idea.archetype}
                            </span>
 <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {idea.estimatedSla}
                            </span>
                          </div>
 <h5 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 line-clamp-1">
                            {idea.title}
                          </h5>
 <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                            {idea.summary}
                          </p>
 <div className="mt-2.5 flex flex-wrap gap-1">
                            {idea.recommendedStack.map((tech) => (
                              <span
                                key={tech}
 className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
 type="button"
                          onClick={() => handleScaffoldWithIdea(idea)}
 className="mt-3 w-full py-2 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
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
 <div className="flex items-center gap-2">
 <Kanban size={18} className="text-neutral-900 dark:text-white" />
 <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                      Workspace Repository
                    </h2>
                  </div>
 <span className="px-2.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-semibold">
                    {visibleProjects.length} Workspaces
                  </span>
                </div>

                {/* Filter controls */}
 <div className="flex flex-wrap items-center gap-3">
                  {/* Search Bar */}
 <div className="relative min-w-[220px]">
                    <Search
                      size={14}
 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
 aria-hidden="true"
                    />
                    <input
 type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
 placeholder="Search library…"
 aria-label="Search workspaces"
 className="h-9 w-full rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141722] pl-9 pr-3 text-xs font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                    />
                  </div>

                  {/* Status Filter Buttons */}
 <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/80 p-1 rounded-full">
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
                          className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                            isActive
 ? "bg-white dark:bg-[#141722] text-neutral-900 dark:text-white shadow-xs"
 : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
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
 className="h-9 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141722] px-3 text-xs font-semibold text-neutral-700 dark:text-neutral-300 focus:outline-none cursor-pointer"
                  >
 <option value="recent">Recent</option>
 <option value="name">Name</option>
 <option value="status">Sort by Status</option>
                  </select>

                  {/* View Mode Toggle */}
                  <div
 className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/80 p-1 rounded-full"
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
 ? "bg-white dark:bg-[#141722] text-neutral-900 dark:text-white shadow-xs"
 : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
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
 ? "bg-white dark:bg-[#141722] text-neutral-900 dark:text-white shadow-xs"
 : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      }`}
                    >
 <List size={14} aria-hidden="true" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Content Area based on Tab & ViewMode */}
 {activeTab === "repos" ? (
 <div className="bg-white dark:bg-[#141722] rounded-3xl p-6 border border-neutral-200/90 dark:border-neutral-800 shadow-sm space-y-4">
 <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
 <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      Connected Source Repositories
                    </h3>
                    <button
 type="button"
                      onClick={() => setShowImport(true)}
 className="px-4 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold"
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
 className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800"
                      >
 <div className="flex items-center gap-3">
 <FolderGit2 size={18} className="text-blue-500" />
                          <div>
 <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                              {repo.name}
                            </h4>
 <span className="text-xs text-neutral-500 dark:text-neutral-400">
 branch: <code className="font-mono">{repo.branch}</code>
                            </span>
                          </div>
                        </div>
 <div className="flex items-center gap-4 text-xs">
 <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                            {repo.status}
                          </span>
 <span className="text-neutral-400">Synced {repo.lastSync}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 ) : activeTab === "deployments" ? (
 <div className="bg-white dark:bg-[#141722] rounded-3xl p-6 border border-neutral-200/90 dark:border-neutral-800 shadow-sm space-y-4">
 <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                    Live Edge Deployments
                  </h3>
 <div className="space-y-3">
                    {DEPLOYMENTS.map((dep) => (
                      <div
                        key={dep.id}
 className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 gap-3"
                      >
                        <div>
 <div className="flex items-center gap-2">
 <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
 <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                              {dep.project}
                            </h4>
 <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                              {dep.environment}
                            </span>
                          </div>
                          <a
                            href={dep.url}
 target="_blank"
 rel="noreferrer"
 className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-1"
                          >
                            <span>{dep.url}</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
 <div className="flex items-center gap-4 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          <span>{dep.region}</span>
 <span className="text-emerald-600 font-bold">{dep.uptime}</span>
                          <span>{dep.latency}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 ) : activeTab === "activity" ? (
 <div className="bg-white dark:bg-[#141722] rounded-3xl p-6 border border-neutral-200/90 dark:border-neutral-800 shadow-sm space-y-4">
 <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                    Autonomous Fleet Audit Stream
                  </h3>
 <div className="space-y-3">
                    {ACTIVITIES.map((act) => (
                      <div
                        key={act.id}
 className="flex items-start justify-between p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 gap-4"
                      >
 <div className="space-y-1">
 <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${act.badgeColor}`}>
                              {act.badge}
                            </span>
 <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                              {act.agent}
                            </span>
 <span className="text-xs text-neutral-400">• {act.project}</span>
                          </div>
 <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                            {act.action}
                          </p>
                        </div>
 <span className="text-xs text-neutral-400 shrink-0">{act.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : LIVE_MODE && (projectsLoading || projectsError || visibleProjects.length === 0) ? (
 <div className="bg-white dark:bg-[#141722] rounded-3xl p-10 border border-neutral-200/90 dark:border-neutral-800 shadow-sm text-center space-y-3">
                  {projectsLoading ? (
 <p className="text-sm text-neutral-500">Loading your projects…</p>
                  ) : projectsError ? (
                    <>
 <p className="text-sm font-semibold text-red-600">{projectsError}</p>
                      <button
 type="button"
                        onClick={loadProjects}
 className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-sm font-semibold"
                      >
                        Retry
                      </button>
                    </>
                  ) : allProjects.length === 0 ? (
                    <>
 <p className="text-base font-bold text-neutral-900 dark:text-white">No projects yet</p>
 <p className="text-sm text-neutral-500">Create your first project to start a build.</p>
                      <button
 type="button"
                        onClick={() => setShowNewDialog(true)}
 className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-semibold"
                      >
                        New project
                      </button>
                    </>
                  ) : (
 <p className="text-sm text-neutral-500">No projects match your filters.</p>
                  )}
                </div>
 ) : viewMode === "table" ? (
                /* Dense Engineering Table View */
 <div className="bg-white dark:bg-[#141722] rounded-3xl p-4 border border-neutral-200/90 dark:border-neutral-800 shadow-sm overflow-x-auto">
 <table role="table" className="w-full text-left border-collapse">
                    <thead>
 <tr className="border-b border-neutral-200 dark:border-neutral-800 text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
 <th className="py-3 px-4">Status</th>
 <th className="py-3 px-4">Workspace</th>
 <th className="py-3 px-4">Tech Stack</th>
 <th className="py-3 px-4">QA Score</th>
 <th className="py-3 px-4">Agents</th>
 <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
 <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80 text-xs">
                      {visibleProjects.map((p) => {
 const badge = getStatusBadge(p.status || (p.live ? "live" : "ready"));
                        const isPinned = pinnedIds.includes(p.id);
                        return (
                          <tr
                            key={p.id}
 className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition group"
                          >
 <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </td>
 <td className="py-3.5 px-4 font-semibold text-neutral-900 dark:text-neutral-100">
 <div className="flex items-center gap-2">
                                <button
 type="button"
                                  onClick={(e) => handleTogglePin(p.id, e)}
 className="text-neutral-400 hover:text-amber-500"
                                >
 <Pin size={13} className={isPinned ? "fill-amber-500 text-amber-500" : ""} />
                                </button>
                                <div>
 <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                                    {p.displayName || p.name}
                                  </div>
 <div className="text-[11px] text-neutral-500 truncate max-w-xs">
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
 className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </td>
 <td className="py-3.5 px-4 font-bold text-neutral-800 dark:text-neutral-200">
 {p.qaScore ? `${p.qaScore}/100` : "—"}
                            </td>
 <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-400">
 {p.agents?.join(", ") || "Full Fleet"}
                            </td>
 <td className="py-3.5 px-4 text-right whitespace-nowrap">
 <div className="inline-flex items-center gap-2">
                                <button
 type="button"
                                  onClick={() => handleAudit(p)}
 aria-label="Audit"
 className="h-7 px-2.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold text-xs"
                                >
                                  Audit
                                </button>
                                <button
 type="button"
                                  onClick={() => navigate(`/p/${p.id}/workspace`)}
 className="h-7 px-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full font-bold text-xs"
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
                /* Grid View (Matching InitiativeCard Aesthetic) */
                <motion.div
                  variants={gridVariants}
 initial="hidden"
 animate="show"
 className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {visibleProjects.map((p) => {
 const badge = getStatusBadge(p.status || (p.live ? "live" : "ready"));
                    const isPinned = pinnedIds.includes(p.id);

                    return (
 <motion.div key={p.id} variants={itemVariants} className="flex flex-col h-full">
                        <div
 className="group relative flex flex-col justify-between h-full bg-white dark:bg-[#141722] border border-neutral-200/90 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 rounded-2xl p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <div>
                            {/* Header Row: Status & QA Badge & Pin */}
 <div className="flex items-center justify-between gap-2 mb-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>

 <div className="flex items-center gap-2">
 <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800/80 px-3 py-1 rounded-full">
 <ShieldCheck size={12} className="text-emerald-500" />
 QA: {p.qaScore ? `${p.qaScore}%` : "—"}
                                </span>

                                <button
 type="button"
                                  onClick={(e) => handleTogglePin(p.id, e)}
 className="text-neutral-400 hover:text-amber-500 p-1 cursor-pointer"
 title={isPinned ? "Unpin workspace" : "Pin workspace"}
                                >
                                  <Pin
                                    size={14}
 className={isPinned ? "fill-amber-500 text-amber-500" : ""}
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Title */}
                            <h3
                              onClick={() => {
                                handleSound();
                                navigate(`/p/${p.id}/workspace`);
                              }}
 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 tracking-tight leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 cursor-pointer"
                            >
                              {p.displayName || p.name}
                            </h3>

                            {/* Description */}
 <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2 leading-relaxed">
 {p.description || "Production-ready decoupled microservice architecture."}
                            </p>

                            {/* Tech stack badges */}
 <div className="mt-5 flex flex-wrap gap-1.5">
                              {p.techStack?.slice(0, 4).map((tech, i) => (
                                <span
                                  key={i}
 className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800/90 text-neutral-700 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-700/60"
                                >
 <Tag size={10} strokeWidth={2} className="text-neutral-400" />
                                  {tech}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Footer Actions */}
 <div className="mt-6 border-t border-neutral-100 dark:border-neutral-800/80 pt-4 flex items-center justify-between">
 <span className="text-xs font-medium text-neutral-400 dark:text-neutral-400">
                              Updated {formatRelativeTime(p.lastBuilt)}
                            </span>

 <div className="flex items-center gap-2">
                              <button
 type="button"
 aria-label="Audit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAudit(p);
                                }}
 className="h-8 px-3 rounded-full border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold text-xs flex items-center gap-1 transition cursor-pointer"
                              >
 <ShieldCheck size={12} className="text-emerald-500" />
                                <span>Audit</span>
                              </button>

                              <button
 type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSound();
                                  navigate(`/p/${p.id}/workspace`);
                                }}
 className="h-8 px-4 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-xs rounded-full flex items-center gap-1.5 transition-transform duration-150 active:scale-95 cursor-pointer shadow-xs"
                              >
                                <span>Open IDE</span>
                                <ArrowRight size={13} strokeWidth={2.2} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </section>
          </div>
        </SuiWindowFrame>
      </div>

      {/* =========================================================================
          NEW PROJECT MODAL (WITH AI ARCHITECT & MANUAL MODES)
      ========================================================================= */}
      {showNewDialog && (
 <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
 <div className="w-full max-w-xl bg-white dark:bg-[#141722] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-2xl space-y-5">
 <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
 <div className="flex items-center gap-2">
 <Sparkles size={18} className="text-amber-500" />
 <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
 {dialogTab === "ai" ? "Gemini AI Architect" : "New Engineering Workspace"}
                </h3>
              </div>
              <button
 type="button"
                onClick={() => setShowNewDialog(false)}
 className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dialog tabs */}
 <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-full text-xs font-bold">
              <button
 type="button"
 onClick={() => setDialogTab("ai")}
                className={`flex-1 py-1.5 rounded-full transition ${
 dialogTab === "ai"
 ? "bg-white dark:bg-[#141722] text-neutral-900 dark:text-white shadow-xs"
 : "text-neutral-600 dark:text-neutral-400"
                }`}
              >
                AI Synthesis Mode
              </button>
              <button
 type="button"
 onClick={() => setDialogTab("manual")}
                className={`flex-1 py-1.5 rounded-full transition ${
 dialogTab === "manual"
 ? "bg-white dark:bg-[#141722] text-neutral-900 dark:text-white shadow-xs"
 : "text-neutral-600 dark:text-neutral-400"
                }`}
              >
                Manual Blueprint
              </button>
            </div>

 {dialogTab === "ai" ? (
 <div className="space-y-4">
 <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Describe what you want to build. Gemini 3.8 Flash will infer the optimal domain models, API schemas, and architecture contracts.
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
 placeholder="scaffold new stack, feature branch, or test suite... (e.g. 'Distributed rate limiter in Go with Redis sliding window')"
                  rows={4}
 className="w-full p-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0E1017] text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />

 <div className="flex items-center justify-between pt-2">
 <div className="text-xs text-neutral-500 font-medium">
                    Fleet: Architect · Builder · QA · DevOps
                  </div>
 <div className="flex items-center gap-2">
                    <button
 type="button"
                      onClick={() => setShowNewDialog(false)}
 className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
 type="button"
                      disabled={isAiGenerating || !aiPrompt.trim()}
                      onClick={() => handleScaffoldWithGemini()}
 aria-label="Generate Blueprint"
 className="px-6 py-2 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-full transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Sparkles size={13} />
 <span>{isAiGenerating ? "Synthesizing…" : "Generate Blueprint"}</span>
                    </button>
                  </div>
                </div>

                {generatedPreview && (
 <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs flex items-center justify-between">
 <span className="font-bold text-emerald-800 dark:text-emerald-200">
                      Generated: {generatedPreview.name}
                    </span>
                    <button
 type="button"
                      onClick={() => {
                        setShowNewDialog(false);
                        navigate(`/p/${generatedPreview.id}/workspace`);
                      }}
 className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Launch Workspace →
                    </button>
                  </div>
                )}
              </div>
            ) : (
 <form onSubmit={handleCreateManual} className="space-y-4">
                <div>
 <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Workspace Name
                  </label>
                  <input
 type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
 placeholder="e.g. payment-service"
 className="w-full h-10 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0E1017] text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                    required
                  />
                </div>
                <div>
 <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Architecture Archetype
                  </label>
                  <select
                    value={newProjectTemplate}
                    onChange={(e) => setNewProjectTemplate(e.target.value)}
 className="w-full h-10 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0E1017] text-xs font-semibold text-neutral-900 dark:text-neutral-100 focus:outline-none"
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
 className="px-4 py-2 text-xs font-bold text-neutral-600 dark:text-neutral-400"
                  >
                    Cancel
                  </button>
                  <button
 type="submit"
 className="px-6 py-2 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-full transition"
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
 <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
 <div className="w-full max-w-2xl bg-white dark:bg-[#141722] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
 <div className="flex items-center gap-2">
 <ShieldCheck size={20} className="text-emerald-500" />
                <div>
 <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    Gemini Architecture & Security Audit
                  </h3>
 <p className="text-xs text-neutral-500">
                    Target: {auditProject.displayName || auditProject.name}
                  </p>
                </div>
              </div>
              <button
 type="button"
                onClick={() => setAuditProject(null)}
 className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            {isAuditing ? (
 <div className="py-12 flex flex-col items-center justify-center gap-3">
 <span className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
 <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">
                  Running Gemini 3.8 Deep System Audit & Vulnerability Assessment…
                </span>
              </div>
            ) : auditResult ? (
 <div className="space-y-4 text-xs">
                {/* Executive Summary */}
 <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 space-y-1">
 <div className="flex items-center justify-between">
 <span className="font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider text-[10px]">
                      Executive Verdict
                    </span>
 <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-black text-xs">
                      Grade: {auditResult.architectureGrade}
                    </span>
                  </div>
 <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed font-medium">
                    {auditResult.executiveSummary}
                  </p>
                </div>

                {/* Score Pills */}
 <div className="grid grid-cols-3 gap-3">
 <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 text-center">
 <span className="text-[10px] text-neutral-500 uppercase font-bold block">
                      Security
                    </span>
 <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      {auditResult.securityScore}%
                    </span>
                  </div>
 <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 text-center">
 <span className="text-[10px] text-neutral-500 uppercase font-bold block">
                      Scalability
                    </span>
 <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                      {auditResult.scalabilityScore}%
                    </span>
                  </div>
 <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 text-center">
 <span className="text-[10px] text-neutral-500 uppercase font-bold block">
                      Reliability
                    </span>
 <span className="text-lg font-black text-purple-600 dark:text-purple-400">
                      {auditResult.reliabilityScore}%
                    </span>
                  </div>
                </div>

                {/* Suggested Enhancements */}
 <div className="space-y-2">
 <h4 className="font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider text-[11px]">
                    Recommended Enhancements
                  </h4>
                  {auditResult.suggestedEnhancements.map((enh, i) => (
                    <div
                      key={i}
 className="p-3 rounded-xl bg-neutral-50 dark:bg-[#0E1017] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3"
                    >
                      <div>
 <div className="font-bold text-neutral-900 dark:text-neutral-100">
                          {enh.title}
                        </div>
 <div className="text-neutral-500 text-[11px]">{enh.impact}</div>
                      </div>
 <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                        {enh.effort} effort
                      </span>
                    </div>
                  ))}
                </div>

                {/* Agent Directives */}
 <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-1.5">
 <span className="font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider text-[10px]">
                    Autonomous Fleet Directives
                  </span>
 <div className="grid grid-cols-2 gap-2 text-[11px] text-blue-800 dark:text-blue-300">
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
 className="px-6 py-2 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-full transition"
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
