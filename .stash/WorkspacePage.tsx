import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { 
  Plus, 
  Terminal, 
  Layers, 
  Eye, 
  Code2, 
  Cpu, 
  Folder, 
  FolderOpen, 
  FileCode2, 
  ChevronRight, 
  ChevronDown, 
  ArrowRight, 
  Clock, 
  ExternalLink, 
  Activity, 
  Sparkles,
  Search,
  Globe,
  Database,
  Maximize2,
  ChevronLeft,
  Settings2,
  Wand2
} from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "motion/react";
import { useBuildStore } from "../store/buildStore";
import { useBuildSocket } from "../hooks/useBuildSocket";
import { runMockBuild } from "../lib/mockEmitter";
import { buildsApi, projectsApi } from "../lib/api";
import { PROJECTS } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";

// Forge OS Suite
import { ForgeCommandTerminal } from "../components/forge-os/ForgeCommandTerminal";
import { ForgeLivingAgents } from "../components/forge-os/ForgeLivingAgents";
import { ForgeBuildCanvas } from "../components/forge-os/ForgeBuildCanvas";
import { ForgeMomentCard } from "../components/forge-os/ForgeMomentCard";
import { ForgeVisualSurface } from "../components/forge-os/ForgeVisualSurface";
import { ForgeCodeSurface } from "../components/forge-os/ForgeCodeSurface";
import { ForgeDebugSurface } from "../components/forge-os/ForgeDebugSurface";
import { ForgeDeploySurface } from "../components/forge-os/ForgeDeploySurface";

interface WorkspaceProject {
  id: string;
  name: string;
}

type SurfaceMode = "canvas" | "code" | "visual" | "debug" | "deploy";

interface FileTreeNode {
  name: string;
  type: "folder" | "file";
  path: string;
  badge?: string;
  children?: FileTreeNode[];
}

const PROJECT_TREE: FileTreeNode[] = [
  {
    name: "app",
    type: "folder",
    path: "app",
    children: [
      { name: "layout.tsx", type: "file", path: "src/app/layout.tsx", badge: "+12" },
      { name: "page.tsx", type: "file", path: "src/app/page.tsx", badge: "+45" },
    ],
  },
  {
    name: "api",
    type: "folder",
    path: "api",
    children: [
      { name: "auth.ts", type: "file", path: "src/api/auth.ts", badge: "+14 -2" },
      { name: "checkout.ts", type: "file", path: "src/api/checkout.ts", badge: "+32 -1" },
    ],
  },
  {
    name: "db",
    type: "folder",
    path: "db",
    children: [
      { name: "schema.sql", type: "file", path: "src/db/schema.sql", badge: "+28" },
      { name: "client.ts", type: "file", path: "src/db/client.ts" },
    ],
  },
  {
    name: "tests",
    type: "folder",
    path: "tests",
    children: [
      { name: "auth.test.ts", type: "file", path: "src/tests/auth.test.ts", badge: "42 passed" },
      { name: "billing.test.ts", type: "file", path: "src/tests/billing.test.ts" },
    ],
  },
];

const HISTORIC_SESSIONS = [
  { id: "s1", time: "Today, 2:14 PM", title: "Build authentication system", status: "complete", files: 4 },
  { id: "s2", time: "Today, 11:30 AM", title: "Stripe checkout & webhook", status: "complete", files: 3 },
  { id: "s3", time: "Yesterday", title: "Initial schema & edge database", status: "complete", files: 6 },
  { id: "s4", time: "Yesterday", title: "Real-time websocket hub", status: "complete", files: 2 },
];

const SPATIAL_WORLDS = [
  { id: "code", label: "Code", icon: Code2, count: "18 files" },
  { id: "agents", label: "Agents", icon: Cpu, count: "3 active" },
  { id: "data", label: "Data", icon: Database, count: "5 tables" },
  { id: "infra", label: "Infra", icon: Globe, count: "Edge Anycast" },
];

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Project state
  const [project, setProject] = useState<WorkspaceProject | null>(
    LIVE_MODE ? null : PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const creatingNewProject = useRef(false);

  // Surface & navigation
  const [activeSurface, setActiveSurface] = useState<SurfaceMode>("canvas");
  const [activeFilePath, setActiveFilePath] = useState<string>("src/api/auth.ts");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    app: true,
    api: true,
    db: true,
    tests: true,
  });

  // Intent input & refinement state
  const [intentInput, setIntentInput] = useState("");
  const [activeGoal, setActiveGoal] = useState("Build authentication system with OAuth & edge JWT tokens");
  const [isBuilding, setIsBuilding] = useState(false);
  const [showMomentCard, setShowMomentCard] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [agentsDrawerOpen, setAgentsDrawerOpen] = useState(false);

  // Left sidebar & right context collapses
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);

  // Global build store
  const [buildId, setBuildId] = useState<string | null>("build-auth-oauth");
  const startBuild = useBuildStore((s) => s.startBuild);
  const sendMessage = useBuildStore((s) => s.sendMessage);
  const handleEvent = useBuildStore((s) => s.handleEvent);
  const { connectionStatus } = useBuildSocket(LIVE_MODE ? buildId : null);

  useEffect(() => {
    if (!LIVE_MODE || !projectId) return;
    let cancelled = false;

    if (projectId === "new") {
      if (creatingNewProject.current) return;
      creatingNewProject.current = true;

      const incoming = location.state as { prompt?: string; template?: string } | null;
      const description = incoming?.prompt?.trim() ?? "";
      const name = description ? description.slice(0, 60) : "Untitled project";
      projectsApi
        .create({ name, description, template: incoming?.template })
        .then((p) => {
          if (!cancelled) setProject({ id: p.id, name: p.name });
        })
        .catch(() => {
          if (!cancelled) {
            toast.error("Couldn't create this project. Please try again.");
            setLoadError("Couldn't create this project. Please try again.");
          }
        });
      return () => {
        cancelled = true;
      };
    }

    projectsApi
      .get(projectId)
      .then((p) => {
        if (!cancelled) setProject({ id: p.id, name: p.name });
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Couldn't load this project. Please try again.");
          setProject({ id: projectId, name: "Untitled project" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, location.state]);

  useEffect(() => {
    if (!buildId || LIVE_MODE) return;
    const cancel = runMockBuild(buildId, handleEvent);
    return cancel;
  }, [buildId, handleEvent]);

  // Global Keyboard Shortcuts (⌘K for command terminal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;
      setActiveGoal(prompt.trim());
      setIsBuilding(true);
      setShowMomentCard(false);
      setIntentInput("");

      sendMessage({ from: "user", text: prompt });

      if (LIVE_MODE && project) {
        try {
          const { build_id } = await buildsApi.create({
            project_id: project.id,
            prompt,
            interactive: true,
          });
          startBuild(build_id, prompt);
          setBuildId(build_id);
        } catch (err: any) {
          const message = err?.response?.data?.detail || "Couldn't start this build. Please try again.";
          handleEvent({
            type: "build_failed",
            version: 1,
            build_id: buildId ?? "unknown",
            data: { error: message },
          });
        }
      } else {
        const newBuildId = `build-${Date.now().toString(36)}`;
        startBuild(newBuildId, prompt);
        setBuildId(newBuildId);
      }

      // Simulate the Forge Moment after completion
      setTimeout(() => {
        setIsBuilding(false);
        setShowMomentCard(true);
        toast.success("Forge completed: Artifact synthesized & verified");
      }, 3500);
    },
    [sendMessage, startBuild, handleEvent, buildId, project]
  );

  const toggleFolder = (folderName: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const handleSelectFile = (path: string) => {
    setActiveFilePath(path);
    setActiveSurface("code");
    toast(`Viewing ${path.split("/").pop()}`, { icon: "📄" });
  };

  if (loadError && !project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#08090C] text-zinc-300 px-6 text-center">
        <p className="text-sm text-zinc-400">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-mono font-medium hover:brightness-110"
        >
          Retry Workspace
        </button>
      </div>
    );
  }

  const projectName = project?.name || "forge-app";

  return (
    <div className="h-full w-full flex flex-col bg-[#07080A] text-zinc-100 select-none overflow-hidden font-sans">
      {/* ─────────────────────────────────────────────────────────────
          TOP CONTROL BAR:
          ◈ FORGE                              ⌘ K    ○ 3 agents
          Surface Mode Switcher: Canvas · Code · Visual · Debug · Deploy
      ───────────────────────────────────────────────────────────── */}
      <header className="h-12 border-b border-white/[0.07] bg-[#0A0C10]/95 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-20">
        {/* Left: Forge Monogram + Project Switcher */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="flex items-center gap-2 text-white hover:opacity-85 transition group focus:outline-none"
            title="Projects World"
          >
            <span className="text-accent font-mono text-base font-bold tracking-tighter">◈</span>
            <span className="font-semibold text-sm tracking-tight font-mono text-zinc-100 group-hover:text-accent transition">
              FORGE
            </span>
          </button>

          <div className="h-3.5 w-px bg-white/10" />

          {/* Project selector dropdown chip */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs font-mono text-zinc-300 hover:border-accent/40 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="truncate max-w-[140px] font-medium">{projectName}</span>
          </div>
        </div>

        {/* Center: Surface Mode Switcher */}
        <div className="hidden md:flex items-center p-1 rounded-xl bg-black/40 border border-white/[0.08] shadow-inner text-xs font-mono">
          {[
            { id: "canvas" as SurfaceMode, label: "Canvas", icon: Layers },
            { id: "code" as SurfaceMode, label: "Code", icon: Code2 },
            { id: "visual" as SurfaceMode, label: "Visual", icon: Eye },
            { id: "debug" as SurfaceMode, label: "Debug", icon: Terminal },
            { id: "deploy" as SurfaceMode, label: "Deploy", icon: Globe },
          ].map(({ id, label, icon: Icon }) => {
            const active = activeSurface === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSurface(id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                  active
                    ? "bg-accent text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                }`}
              >
                <Icon size={12} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: ⌘K Command Surface + Living Agents Pill */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {/* ⌘K Trigger Button */}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white transition shadow-sm"
            title="Open Command Surface (⌘K)"
          >
            <Search size={12} className="text-accent" />
            <span className="hidden sm:inline text-[11px]">Command</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[10px] text-zinc-400">
              ⌘ K
            </kbd>
          </button>

          {/* Living Agents Status Pill */}
          <button
            type="button"
            onClick={() => setAgentsDrawerOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/25 text-accent transition font-mono text-[11px]"
            title="Living System Nodes (3 Agents Working)"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="font-semibold">3 agents</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition"
            title="Environment Settings"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MAIN 3-COLUMN WORKSPACE:
          Left: WORKSPACE (Explorer, Sessions, Spatial Worlds)
          Center: ACTIVE BUILD (Interactive Canvas, Surfaces, Forge Moment)
          Right: CONTEXT (Files, Changes, Live Preview, Agent fleet)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* ────────────── LEFT COLUMN: WORKSPACE ────────────── */}
        <aside
          className={`shrink-0 border-r border-white/[0.07] bg-[#090A0D] flex flex-col transition-all duration-200 z-10 ${
            sidebarCollapsed ? "w-12" : "w-64"
          }`}
        >
          {/* Header & New Project Button */}
          <div className="p-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
            {!sidebarCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    handleSubmit("Build a new interactive feature module");
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent hover:brightness-110 text-white font-mono text-xs font-semibold shadow-sm transition active:scale-95"
                >
                  <Plus size={13} />
                  <span>New Intent</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition"
                  title="Collapse Workspace Sidebar"
                >
                  <ChevronLeft size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="w-full flex justify-center p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.04] transition"
                title="Expand Workspace Sidebar"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 text-xs font-mono">
              {/* File Tree: forge-app */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold px-1 pb-1.5">
                  <span className="tracking-wider uppercase">WORKSPACE</span>
                  <span className="text-accent text-[10px]">{projectName}</span>
                </div>

                <div className="space-y-0.5 mt-1">
                  {PROJECT_TREE.map((node) => {
                    const isOpen = openFolders[node.name];
                    return (
                      <div key={node.name} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => toggleFolder(node.name)}
                          className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03] transition text-left"
                        >
                          {isOpen ? (
                            <ChevronDown size={12} className="text-zinc-500" />
                          ) : (
                            <ChevronRight size={12} className="text-zinc-500" />
                          )}
                          {isOpen ? (
                            <FolderOpen size={13} className="text-accent shrink-0" />
                          ) : (
                            <Folder size={13} className="text-zinc-400 shrink-0" />
                          )}
                          <span className="font-medium text-zinc-200">{node.name}</span>
                        </button>

                        {isOpen && node.children && (
                          <div className="pl-6 space-y-0.5">
                            {node.children.map((child) => {
                              const isSelected = activeFilePath === child.path;
                              return (
                                <button
                                  key={child.path}
                                  type="button"
                                  onClick={() => handleSelectFile(child.path)}
                                  className={`w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-left transition ${
                                    isSelected
                                      ? "bg-accent/15 text-accent font-semibold"
                                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <FileCode2 size={12} className={isSelected ? "text-accent" : "text-zinc-500"} />
                                    <span className="truncate">{child.name}</span>
                                  </div>
                                  {child.badge && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400">
                                      {child.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sessions List */}
              <div className="pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold px-1 pb-1.5">
                  <span className="tracking-wider uppercase">SESSIONS</span>
                  <Clock size={11} className="text-zinc-500" />
                </div>

                <div className="space-y-1 mt-1">
                  {HISTORIC_SESSIONS.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        setActiveGoal(session.title);
                        toast.success(`Switched context to: "${session.title}"`);
                      }}
                      className="w-full text-left p-2 rounded-xl hover:bg-white/[0.03] transition border border-transparent hover:border-white/[0.05] group"
                    >
                      <div className="text-zinc-300 group-hover:text-white font-medium truncate text-xs">
                        {session.title}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                        <span>{session.time}</span>
                        <span className="text-emerald-400">✓ Complete</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Spatial Worlds Navigation */}
              <div className="pt-3 border-t border-white/[0.06]">
                <div className="text-[11px] text-zinc-400 font-semibold px-1 pb-1.5 tracking-wider uppercase">
                  SPATIAL WORLDS
                </div>
                <div className="space-y-1 mt-1">
                  {SPATIAL_WORLDS.map((world) => {
                    const Icon = world.icon;
                    return (
                      <button
                        key={world.id}
                        type="button"
                        onClick={() => {
                          if (world.id === "code") setActiveSurface("code");
                          else if (world.id === "infra") setActiveSurface("deploy");
                          else if (world.id === "agents") setAgentsDrawerOpen(true);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] transition"
                      >
                        <div className="flex items-center gap-2">
                          <Icon size={13} className="text-accent" />
                          <span>{world.label}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{world.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ────────────── CENTER COLUMN: ACTIVE BUILD & SURFACES ────────────── */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#07080A] relative overflow-hidden">
          {/* Active Goal Header Banner */}
          <div className="px-6 py-3 border-b border-white/[0.06] bg-[#090A0E]/80 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase">
                  {isBuilding ? "FORGE IS SYNTHESIZING WORKSPACE" : "ACTIVE BUILD FOCUS"}
                </div>
                <h1 className="text-sm font-medium text-white truncate font-sans">
                  "{activeGoal}"
                </h1>
              </div>
            </div>

            {/* Quick action triggers */}
            <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowMomentCard(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white transition"
                title="View Artifact Completion Card"
              >
                <Sparkles size={12} className="text-accent" />
                <span>Forge Artifact</span>
              </button>
            </div>
          </div>

          {/* Active Surface Rendering Area */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {activeSurface === "canvas" && (
              <ForgeBuildCanvas
                buildPrompt={activeGoal}
                onSelectNodeFile={(file: string) => {
                  setActiveFilePath(file);
                  setActiveSurface("code");
                }}
                onOpenPreview={() => setActiveSurface("visual")}
              />
            )}

            {activeSurface === "code" && (
              <ForgeCodeSurface
                initialFile={activeFilePath}
              />
            )}

            {activeSurface === "visual" && (
              <ForgeVisualSurface />
            )}

            {activeSurface === "debug" && (
              <ForgeDebugSurface />
            )}

            {activeSurface === "deploy" && (
              <ForgeDeploySurface projectName={projectName} />
            )}

            {/* The "Forge Moment" Overlay Card (pops upon synthesis completion) */}
            <AnimatePresence>
              {showMomentCard && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
                  <ForgeMomentCard
                    title="Authentication & Session Engine"
                    filesChangedCount={12}
                    testsPassedCount={42}
                    onOpenPreview={() => {
                      setShowMomentCard(false);
                      setActiveSurface("visual");
                    }}
                    onInspectCode={() => {
                      setShowMomentCard(false);
                      setActiveSurface("code");
                    }}
                    onDismiss={() => setShowMomentCard(false)}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Intent Bar: "Ask Forge anything..." + Rapid Refinements */}
          <div className="p-4 border-t border-white/[0.07] bg-[#090A0E] shrink-0">
            <div className="max-w-4xl mx-auto space-y-2">
              {/* Intent prompt input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(intentInput);
                }}
                className="relative flex items-center"
              >
                <div className="absolute left-3.5 text-accent">
                  <Wand2 size={16} />
                </div>
                <input
                  type="text"
                  value={intentInput}
                  onChange={(e) => setIntentInput(e.target.value)}
                  placeholder="Ask Forge anything... (e.g. 'Add Stripe webhook signature verification')"
                  className="w-full pl-10 pr-24 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] focus:border-accent/60 focus:bg-white/[0.05] text-sm text-zinc-100 placeholder-zinc-500 font-sans outline-none transition shadow-inner"
                />
                <button
                  type="submit"
                  disabled={!intentInput.trim()}
                  className="absolute right-2 px-3.5 py-1.5 rounded-xl bg-accent hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 text-white font-mono text-xs font-medium flex items-center gap-1.5 transition active:scale-95"
                >
                  <span>Forge</span>
                  <ArrowRight size={12} />
                </button>
              </form>

              {/* Refinement suggestion chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono text-zinc-400">
                <span className="text-[11px] text-zinc-500 shrink-0">Refinements:</span>
                {[
                  "Add Stripe webhook signature verification",
                  "Test edge cases (42 tests)",
                  "Generate mock seed data",
                  "Deploy to edge cluster",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSubmit(chip)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-300 hover:text-white transition"
                  >
                    › {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ────────────── RIGHT COLUMN: CONTEXT ────────────── */}
        <aside
          className={`shrink-0 border-l border-white/[0.07] bg-[#090A0D] flex flex-col transition-all duration-200 z-10 ${
            contextCollapsed ? "w-10" : "w-72"
          }`}
        >
          {/* Header */}
          <div className="p-3 border-b border-white/[0.06] flex items-center justify-between">
            {!contextCollapsed ? (
              <>
                <div className="flex items-center gap-2 text-[11px] font-mono font-semibold text-zinc-300">
                  <Activity size={13} className="text-accent" />
                  <span className="tracking-wider uppercase">CONTEXT</span>
                </div>
                <button
                  type="button"
                  onClick={() => setContextCollapsed(true)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition"
                  title="Collapse Context Panel"
                >
                  <ChevronRight size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setContextCollapsed(false)}
                className="w-full flex justify-center text-zinc-400 hover:text-white transition"
                title="Expand Context Panel"
              >
                <ChevronLeft size={14} />
              </button>
            )}
          </div>

          {!contextCollapsed && (
            <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs font-mono">
              {/* Files Context */}
              <div>
                <div className="text-[11px] text-zinc-400 font-semibold pb-1.5 tracking-wider uppercase">
                  ACTIVE FILES
                </div>
                <div className="space-y-1">
                  {[
                    { name: "auth.ts", delta: "+14 -2", path: "src/api/auth.ts" },
                    { name: "db.ts", delta: "+28 -0", path: "src/db/client.ts" },
                    { name: "schema.sql", delta: "+45 -5", path: "src/db/schema.sql" },
                    { name: "checkout.ts", delta: "+32 -1", path: "src/api/checkout.ts" },
                  ].map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => handleSelectFile(file.path)}
                      className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition text-left group"
                    >
                      <span className="text-zinc-200 group-hover:text-white font-medium">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-emerald-400">{file.delta}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Changes Summary Card */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                <div className="text-[11px] text-zinc-400 uppercase tracking-wider">
                  NET CHANGES
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm">+119 -8 lines</span>
                  <span className="text-accent text-[11px]">14.2k tokens</span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  42 tests passed in 142ms · Zero regressions
                </div>
              </div>

              {/* Compact Live Interactive Preview Tile */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold pb-1.5">
                  <span className="tracking-wider uppercase">PREVIEW</span>
                  <button
                    type="button"
                    onClick={() => setActiveSurface("visual")}
                    className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                  >
                    <span>Expand</span>
                    <Maximize2 size={10} />
                  </button>
                </div>

                <button 
                  type="button"
                  onClick={() => setActiveSurface("visual")}
                  className="w-full text-left rounded-xl border border-white/[0.08] bg-[#0D0F14] p-3 hover:border-accent/40 transition group relative overflow-hidden focus:outline-none"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                        LIVE
                      </span>
                    </div>
                    <ExternalLink size={11} className="text-zinc-500 group-hover:text-white transition" />
                  </div>
                  <div className="py-4 text-center">
                    <div className="text-xs font-semibold text-white">Stripe Checkout + Auth</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Click to interact in full canvas</div>
                  </div>
                </button>
              </div>

              {/* Intelligence Context Chips */}
              <div>
                <div className="text-[11px] text-zinc-400 font-semibold pb-1.5 tracking-wider uppercase">
                  INTELLIGENCE UNDERSTANDING
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["auth", "database", "existing API", "42 tests", "JWT edge"].map((item) => (
                    <span
                      key={item}
                      className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-zinc-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Living System Entities */}
              <div className="pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold pb-2">
                  <span className="tracking-wider uppercase">LIVING AGENTS</span>
                  <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Builder", status: "Creating API routes", color: "bg-amber-400" },
                    { name: "QA Engine", status: "Running 42 tests", color: "bg-emerald-400" },
                    { name: "Researcher", status: "Checking OAuth spec", color: "bg-cyan-400" },
                    { name: "Architect", status: "Topology verified", color: "bg-purple-400" },
                  ].map((agent) => (
                    <div
                      key={agent.name}
                      className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between"
                    >
                      <div>
                        <div className="text-zinc-200 font-medium text-xs flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${agent.color}`} />
                          <span>{agent.name}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{agent.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CINEMATIC COMMAND TERMINAL (⌘K):
          Dims the entire workspace into a focused command surface
      ───────────────────────────────────────────────────────────── */}
      <ForgeCommandTerminal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSubmit={(intent: string) => handleSubmit(intent)}
      />

      {/* Living Agents Drawer Modal */}
      <AnimatePresence>
        {agentsDrawerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-white/10 bg-[#0C0E14] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <h3 className="font-mono text-sm font-semibold text-white">
                    Living Agent Fleet Telemetry
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAgentsDrawerOpen(false)}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 text-xs font-mono text-zinc-400 hover:text-white"
                >
                  Close [Esc]
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <ForgeLivingAgents />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
