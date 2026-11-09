import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Terminal,
  Folder,
  FolderOpen,
  FileCode2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Layers,
  Code2,
  Eye,
  Bug,
  Rocket,
  Search,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Bot,
  FolderTree,
  Volume2,
  VolumeX,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Zap,
  Globe,
  RefreshCw,
  Copy,
  ExternalLink,
  Play,
  X,
  Edit3,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import toast from "react-hot-toast";
import { useBuildStore } from "../store/buildStore";
import { useBuildSocket } from "../hooks/useBuildSocket";
import { runMockBuild } from "../lib/mockEmitter";
import { buildsApi, projectsApi } from "../lib/api";
import { PROJECTS, findProjectById, getCustomProjects, type Project } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { SuiWindowFrame, BottomNavItem } from "../components/pm/SuiWindowFrame";
import { SuiKeycapVisual } from "../components/pm/SuiKeycapVisual";
import { VoiceInputButton } from "../components/pm/VoiceInputButton";
import { ForgeBuildCanvas } from "../components/forge-os/ForgeBuildCanvas";
import { ForgeCodeSurface } from "../components/forge-os/ForgeCodeSurface";
import { ForgeVisualSurface } from "../components/forge-os/ForgeVisualSurface";
import { ForgeDebugSurface } from "../components/forge-os/ForgeDebugSurface";
import { ForgeDeploySurface } from "../components/forge-os/ForgeDeploySurface";
import { ForgeMomentCard } from "../components/forge-os/ForgeMomentCard";
import { synthesizeCodeForPrompt, SynthesizedFile } from "../lib/codeSynthesizer";
import type { CanvasNode } from "../components/forge-os/ForgeBuildCanvas";

/* ------------------------------------------------------------------ */
/* Subtle Cyber Audio Synthesizer (Identical to Projects & Initiatives)*/
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

export type SurfaceMode = "canvas" | "code" | "visual" | "debug" | "agents" | "deploy";

interface WorkspaceProject {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  techStack?: string[];
  agents?: string[];
  fileTree?: Record<string, string>;
}

interface TreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  badge?: string;
  badgeColor?: string;
  children?: TreeNode[];
}

const INITIAL_PROJECT_TREE: TreeNode[] = [
  {
    name: "src",
    type: "folder",
    path: "src",
    children: [
      {
        name: "api",
        type: "folder",
        path: "src/api",
        children: [
          { name: "auth.ts", type: "file", path: "src/api/auth.ts", badge: "PKCE", badgeColor: "bg-emerald-400 text-black" },
          { name: "checkout.ts", type: "file", path: "src/api/checkout.ts", badge: "Stripe", badgeColor: "bg-cyan-400 text-black" },
          { name: "webhooks.ts", type: "file", path: "src/api/webhooks.ts" },
        ],
      },
      {
        name: "app",
        type: "folder",
        path: "src/app",
        children: [
          { name: "layout.tsx", type: "file", path: "src/app/layout.tsx" },
          { name: "page.tsx", type: "file", path: "src/app/page.tsx" },
          { name: "dashboard.tsx", type: "file", path: "src/app/dashboard.tsx" },
        ],
      },
      {
        name: "db",
        type: "folder",
        path: "src/db",
        children: [
          { name: "schema.ts", type: "file", path: "src/db/schema.ts", badge: "Neon", badgeColor: "bg-purple-400 text-black" },
          { name: "migrations.ts", type: "file", path: "src/db/migrations.ts" },
        ],
      },
      {
        name: "tests",
        type: "folder",
        path: "src/tests",
        children: [
          { name: "auth.test.ts", type: "file", path: "src/tests/auth.test.ts", badge: "42/42", badgeColor: "bg-emerald-400 text-black" },
          { name: "billing.test.ts", type: "file", path: "src/tests/billing.test.ts" },
        ],
      },
      { name: "App.tsx", type: "file", path: "src/App.tsx" },
      { name: "index.css", type: "file", path: "src/index.css" },
    ],
  },
  { name: "package.json", type: "file", path: "package.json" },
  { name: "tsconfig.json", type: "file", path: "tsconfig.json" },
  { name: "vite.config.ts", type: "file", path: "vite.config.ts" },
];

const DEFAULT_WORKSPACE_FILES: Record<string, string> = {
  "src/api/auth.ts": `import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sign } from 'hono/jwt';

const auth = new Hono();

const OAuthSchema = z.object({
  provider: z.enum(['google', 'github']),
  code: z.string().min(1),
  codeVerifier: z.string().min(43),
});

// Handle OAuth 2.1 authorization code exchange with PKCE
auth.post('/oauth/callback', zValidator('json', OAuthSchema), async (c) => {
  const { provider, code, codeVerifier } = c.req.valid('json');
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      client_id: process.env.GOOGLE_CLIENT_ID!,
    }),
  });

  const tokens = await tokenResponse.json();
  const sessionJwt = await sign({ sub: tokens.sub, email: tokens.email }, process.env.JWT_SECRET!);

  return c.json({ ok: true, token: sessionJwt });
});

export default auth;`,

  "src/api/checkout.ts": `import Stripe from 'stripe';
import { Hono } from 'hono';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const billing = new Hono();

billing.post('/create-session', async (c) => {
  const { planId, customerEmail } = await c.req.json();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: [{ price: planId, quantity: 1 }],
    success_url: \`\${process.env.APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}\`,
    cancel_url: \`\${process.env.APP_URL}/pricing\`,
  });

  return c.json({ sessionId: session.id, url: session.url });
});

export default billing;`,

  "src/db/schema.sql": `-- Forge Core Database Schema (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_users_email ON users(email);`,
};

function addSynthesizedFilesToTree(currentTree: TreeNode[], files: SynthesizedFile[]): TreeNode[] {
  const tree = JSON.parse(JSON.stringify(currentTree)) as TreeNode[];

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop()!;
    let currentLevel = tree;

    for (const folderName of parts) {
      let existingFolder = currentLevel.find((n) => n.type === "folder" && n.name === folderName);
      if (!existingFolder) {
        existingFolder = {
          name: folderName,
          type: "folder",
          path: folderName,
          children: [],
        };
        currentLevel.unshift(existingFolder);
      }
      if (!existingFolder.children) {
        existingFolder.children = [];
      }
      currentLevel = existingFolder.children;
    }

    const alreadyExists = currentLevel.find((n) => n.type === "file" && n.name === fileName);
    if (!alreadyExists) {
      let badge: string | undefined;
      let badgeColor: string | undefined;
      if (fileName.includes("Map")) {
        badge = "Maps";
        badgeColor = "bg-emerald-400 text-black";
      } else if (fileName.includes("maps")) {
        badge = "API";
        badgeColor = "bg-amber-400 text-black";
      } else if (fileName.endsWith(".test.tsx") || fileName.endsWith(".test.ts")) {
        badge = "QA";
        badgeColor = "bg-cyan-400 text-black";
      }
      currentLevel.push({
        name: fileName,
        type: "file",
        path: file.path,
        badge,
        badgeColor,
      });
    }
  }

  return tree;
}

const STREAMING_LOGS = [
  { time: "02:14:02", agent: "Architect", message: "Resolved RFC 7636 PKCE code challenge requirements for Google OAuth", level: "info" },
  { time: "02:14:08", agent: "Builder", message: "Generated src/api/auth.ts with Hono JWT session signing (46 lines)", level: "info" },
  { time: "02:14:12", agent: "Builder", message: "Validated Stripe webhook signature handler with replay prevention", level: "info" },
  { time: "02:14:15", agent: "QA Engine", message: "Executed Vitest suite: 42/42 assertions passed in 142ms", level: "success" },
  { time: "02:14:19", agent: "DevOps", message: "Edge bundle synthesized: 148KB, 5 regions ready for cold start < 20ms", level: "info" },
];

const LIVING_AGENTS_DATA = [
  {
    name: "Architect Agent",
    role: "System Topology & RFC 7636 PKCE",
    status: "Active in Memory",
    color: "bg-amber-400",
    token: "4.2k tokens",
    confidence: "98.4%",
    task: "DAG topology validated · 0 circular dependencies",
  },
  {
    name: "Builder Agent",
    role: "Code Synthesis & Router Handlers",
    status: "Synthesis Complete",
    color: "bg-cyan-400",
    token: "8.7k tokens",
    confidence: "99.1%",
    task: "Generated 14 files with strict TypeScript validation",
  },
  {
    name: "QA Engine",
    role: "Vitest Assertions & Coverage",
    status: "42/42 Tests Passing",
    color: "bg-emerald-400",
    token: "2.1k tokens",
    confidence: "100%",
    task: "Zero regressions across Auth & Billing test matrices",
  },
  {
    name: "Security Auditor",
    role: "OAuth 2.1 & Token Sanitization",
    status: "Zero Vulnerabilities",
    color: "bg-purple-400",
    token: "3.8k tokens",
    confidence: "99.9%",
    task: "Passed OWASP Top 10 + timing-attack constant-time checks",
  },
  {
    name: "DevOps Agent",
    role: "Global Edge Cluster & Latency",
    status: "Live in 5 Regions",
    color: "bg-[#FF7A00]",
    token: "1.9k tokens",
    confidence: "97.8%",
    task: "Edge cold start < 18ms across SFO, IAD, LHR, FRA, HND",
  },
];

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(true);
  const handleSound = useCallback((pitch = 880) => {
    if (soundEnabled) synth.playClick(pitch);
  }, [soundEnabled]);

  // Project state
  const [project, setProject] = useState<WorkspaceProject | null>(() => {
    if (LIVE_MODE) return null;
    const found = findProjectById(projectId);
    return found
      ? {
          id: found.id,
          name: found.displayName || found.name,
          displayName: found.displayName || found.name,
          description: found.description,
          techStack: found.techStack,
          agents: found.agents,
          fileTree: found.fileTree,
        }
      : {
          id: "proj-001",
          name: "habit-tracker",
          displayName: "Habit Tracker Pro",
          description: "Daily habit tracking with streaks, heatmaps, and reminders.",
          techStack: ["React 19", "TypeScript", "TailwindCSS", "Vitest", "Edge"],
          agents: ["architect", "developer", "pm", "integration"],
        };
  });

  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [filesExplorerOpen, setFilesExplorerOpen] = useState(false);
  const [agentsInspectorOpen, setAgentsInspectorOpen] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const creatingNewProject = useRef(false);

  useEffect(() => {
    if (projectId && projectId !== "new") {
      try {
        localStorage.setItem("forge_last_project", projectId);
      } catch {
        // ignore localStorage access errors
      }
    }
  }, [projectId]);

  // Surface & navigation
  const [activeSurface, setActiveSurface] = useState<SurfaceMode>("canvas");
  const [activeFilePath, setActiveFilePath] = useState<string>("src/api/auth.ts");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    src: true,
    api: true,
    app: true,
    db: true,
    tests: true,
  });
  const [fileSearchQuery, setFileSearchQuery] = useState("");

  // Intent input & refinement state
  const [intentInput, setIntentInput] = useState("");
  const [promptMode, setPromptMode] = useState<"synthesis" | "refactor" | "test" | "debug">("synthesis");
  const [activeGoal, setActiveGoal] = useState<string>(() => {
    if (project?.description) return project.description;
    if (project?.displayName) return `Build and scale ${project.displayName}`;
    return "Interactive Google Maps Explorer & Geolocation Service";
  });
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>(DEFAULT_WORKSPACE_FILES);
  const [projectTree, setProjectTree] = useState<TreeNode[]>(INITIAL_PROJECT_TREE);
  const [activeDagNodes, setActiveDagNodes] = useState<CanvasNode[] | undefined>(undefined);
  const [logsList, setLogsList] = useState(STREAMING_LOGS);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState<number>(2); // 1: Spec, 2: Code, 3: QA, 4: Deploy
  const [showMomentCard, setShowMomentCard] = useState(false);

  // Sync objective with project when project changes
  useEffect(() => {
    if (project?.description && project.description.trim()) {
      setActiveGoal(project.description.trim());
    } else if (project?.displayName) {
      setActiveGoal(`Build and scale ${project.displayName}`);
    }
  }, [project?.id, project?.description, project?.displayName]);

  // Load project initial files if present
  useEffect(() => {
    if (project && (project as any).initialFiles && Array.isArray((project as any).initialFiles)) {
      const map: Record<string, string> = {};
      const newFiles: SynthesizedFile[] = [];
      (project as any).initialFiles.forEach((f: any) => {
        if (f.path && f.content) {
          map[f.path] = f.content;
          newFiles.push({ path: f.path, description: f.description || "", content: f.content });
        }
      });
      if (Object.keys(map).length > 0) {
        setProjectFiles((prev) => ({ ...prev, ...map }));
        setProjectTree((prev) => addSynthesizedFilesToTree(prev, newFiles));
      }
    }
  }, [project]);

  // Global build store
  const [buildId, setBuildId] = useState<string | null>("build-auth-oauth");
  const startBuild = useBuildStore((s) => s.startBuild);
  const handleEvent = useBuildStore((s) => s.handleEvent);
  useBuildSocket(LIVE_MODE ? buildId : null);

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
          if (!cancelled) {
            setProject({
              id: p.id,
              name: p.name,
              displayName: p.displayName || p.name,
              description,
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            toast.error("Couldn't create this project. Please try again.");
          }
        });
      return () => {
        cancelled = true;
      };
    }

    projectsApi
      .get(projectId)
      .then((p) => {
        if (!cancelled) {
          setProject({
            id: p.id,
            name: p.name,
            displayName: p.displayName || p.name,
            description: p.description,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Couldn't load this project. Using fallback.");
          setProject({ id: projectId, name: "Untitled project", displayName: "Untitled project" });
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

  const toggleFolder = (folderName: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const handleSelectFile = (filePath: string) => {
    handleSound(950);
    setActiveFilePath(filePath);
    setActiveSurface("code");
    setFilesExplorerOpen(false);
    toast.success(`Loaded ${filePath}`);
  };

  const handleSubmit = async (promptText?: string) => {
    const textToSubmit = (promptText ?? intentInput).trim();
    if (!textToSubmit || isBuilding) return;

    handleSound(1050);
    setActiveGoal(textToSubmit);
    setIsBuilding(true);
    setIntentInput("");

    if (LIVE_MODE && project?.id) {
      buildsApi
        .create({ project_id: project.id, prompt: textToSubmit })
        .then((b) => {
          setBuildId(b.id);
          startBuild(b.id, textToSubmit);
          toast.success("Build job dispatched to autonomous agents");
        })
        .catch(() => {
          toast.error("Failed to start build job");
        });
    }

    try {
      toast.loading(`Swarm synthesizing code for: "${textToSubmit.slice(0, 32)}..."`, { id: "build-toast" });

      const result = await synthesizeCodeForPrompt(textToSubmit, projectFiles);

      // Merge files
      const newFilesMap: Record<string, string> = { ...projectFiles };
      result.files.forEach((f) => {
        newFilesMap[f.path] = f.content;
      });
      setProjectFiles(newFilesMap);

      // Add to tree
      setProjectTree((prev) => addSynthesizedFilesToTree(prev, result.files));

      // Expand folders
      setOpenFolders((prev) => ({
        ...prev,
        components: true,
        api: true,
        types: true,
        tests: true,
        src: true,
      }));

      // Set active file
      if (result.primaryFile) {
        setActiveFilePath(result.primaryFile);
      }

      // Set custom DAG nodes
      if (result.dagNodes && result.dagNodes.length > 0) {
        setActiveDagNodes(result.dagNodes);
      }

      // Add logs
      if (result.logs && result.logs.length > 0) {
        setLogsList((prev) => [...result.logs, ...prev]);
      }

      // Switch to Code Studio surface so user immediately inspects generated code
      setActiveSurface("code");

      setBuildStep((prev) => (prev < 4 ? prev + 1 : 1));
      setIsBuilding(false);
      setShowMomentCard(true);
      synth.playSwitch();
      toast.success(`Synthesized code for "${textToSubmit.slice(0, 28)}"! Loaded in Code Studio.`, { id: "build-toast" });
    } catch (err: any) {
      setIsBuilding(false);
      toast.error(err?.message || "Failed to synthesize code.", { id: "build-toast" });
    }
  };

  const projectName = project?.displayName || project?.name || "Autonomous Workspace";
  const allProjectsList: Project[] = useMemo(() => {
    const custom = getCustomProjects();
    const map = new Map<string, Project>();
    [...custom, ...PROJECTS].forEach((p) => map.set(p.id, p));
    return Array.from(map.values());
  }, []);

  // Window frame top navigation tabs matching Projects & Initiatives style
  const navItems: BottomNavItem[] = useMemo(() => {
    return [
      {
        id: "canvas",
        label: "Canvas",
        icon: <Layers size={14} className="shrink-0" />,
        badge: "DAG",
        isActive: activeSurface === "canvas",
        onClick: () => {
          handleSound();
          setActiveSurface("canvas");
        },
      },
      {
        id: "code",
        label: "Code Studio",
        icon: <Code2 size={14} className="shrink-0" />,
        badge: "TS",
        isActive: activeSurface === "code",
        onClick: () => {
          handleSound();
          setActiveSurface("code");
        },
      },
      {
        id: "visual",
        label: "Live Preview",
        icon: <Eye size={14} className="shrink-0" />,
        badge: "Edge",
        isActive: activeSurface === "visual",
        onClick: () => {
          handleSound();
          setActiveSurface("visual");
        },
      },
      {
        id: "debug",
        label: "QA Tests",
        icon: <Bug size={14} className="shrink-0" />,
        badge: "42/42",
        isActive: activeSurface === "debug",
        onClick: () => {
          handleSound();
          setActiveSurface("debug");
        },
      },
      {
        id: "agents",
        label: "Agent Fleet",
        icon: <Bot size={14} className="shrink-0" />,
        badge: "5",
        isActive: activeSurface === "agents",
        onClick: () => {
          handleSound();
          setActiveSurface("agents");
        },
      },
      {
        id: "deploy",
        label: "Deploy & Edge",
        icon: <Rocket size={14} className="shrink-0" />,
        badge: "5 PoPs",
        isActive: activeSurface === "deploy",
        onClick: () => {
          handleSound();
          setActiveSurface("deploy");
        },
      },
      {
        id: "all-workspaces",
        label: "All Workspaces",
        icon: <ArrowLeft size={14} className="shrink-0" />,
        onClick: () => {
          handleSound();
          navigate("/projects");
        },
      },
    ];
  }, [activeSurface, handleSound, navigate]);

  return (
    <div className="relative min-h-screen w-full bg-[#E5EEF8] dark:bg-[#07090E] p-1 sm:p-2 md:p-3 font-sans antialiased text-[#111827] dark:text-[#F3F4F6] transition-colors duration-200 flex flex-col items-stretch justify-start">
      <div className="w-full flex-1 flex flex-col">
        {/* =========================================================================
            SUI WINDOW FRAME (IDENTICAL TO PROJECTS & INITIATIVE PAGES)
        ========================================================================= */}
        <SuiWindowFrame
          title={`Forge Workspace · ${projectName.toUpperCase()}`}
          tagLabel="status"
          tagText={isBuilding ? "Compiling · Multi-Agent Swarm" : "Production Software"}
          navPosition="top"
          navItems={navItems}
          bottomNavItems={navItems}
          primaryAction={{
            label: isBuilding ? "Synthesizing…" : "Synthesize",
            icon: <Sparkles size={14} className="text-amber-400" />,
            onClick: () => {
              handleSound();
              handleSubmit(intentInput || activeGoal);
            },
          }}
        >
          <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-h-[calc(100vh-140px)]">
            {/* =========================================================================
                1. COMPACT WORKSPACE CONTROL STRIP / TOOLBAR
            ========================================================================= */}
            <div className="border-2 border-[#000F1D] bg-[#FAF7F2] dark:bg-[#141824] px-3 py-2 rounded-xl shadow-[3px_3px_0_#000F1D] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              {/* Left: Project Title, Status & Active Goal */}
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                {/* Semantic H1 for Workspace Name & Test Compatibility */}
                <h1 className="text-xs sm:text-sm font-black uppercase tracking-tight text-neutral-900 dark:text-white flex items-center gap-1.5 shrink-0">
                  <Folder size={15} className="text-[#1D4ED8]" />
                  <span>{projectName}</span>
                </h1>

                {/* Status Chips */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    EDGE LIVE · READY
                  </span>

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-100 text-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
                    <CheckCircle2 size={11} /> 42/42 VITEST PASSED
                  </span>

                  <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    STEP {buildStep}/4 · {buildStep === 1 ? "SPEC" : buildStep === 2 ? "CODE" : buildStep === 3 ? "QA" : "DEPLOY"}
                  </span>
                </div>

                {/* Objective / Goal Indicator */}
                <div className="flex items-center gap-1.5 min-w-0 max-w-md">
                  <span className="px-2 py-0.5 bg-[#1A1A1A] text-white dark:bg-white dark:text-black font-mono font-black text-[10px] uppercase rounded border border-black shrink-0">
                    OBJECTIVE
                  </span>

                  {editingGoal ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setEditingGoal(false);
                        toast.success("Objective updated");
                      }}
                      className="flex-1 flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={activeGoal}
                        onChange={(e) => setActiveGoal(e.target.value)}
                        className="w-full px-2 py-0.5 border-2 border-black bg-white dark:bg-[#1E1E28] font-mono text-xs font-bold rounded"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="px-2 py-0.5 bg-black text-white text-[11px] font-bold rounded border border-black"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate">
                        "{activeGoal}"
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingGoal(true)}
                        className="p-1 text-neutral-500 hover:text-black dark:hover:text-white"
                        title="Edit objective"
                      >
                        <Edit3 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Quick Tool Triggers */}
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                <button
                  type="button"
                  id="ws-open-files-btn"
                  onClick={() => {
                    handleSound();
                    setFilesExplorerOpen(true);
                  }}
                  className="h-8 px-2.5 border-2 border-[#000F1D] bg-white dark:bg-[#1C2030] font-black uppercase text-[10px] sm:text-[11px] rounded flex items-center gap-1.5 shadow-[1.5px_1.5px_0_#000F1D] hover:bg-[#FFD731] hover:text-black active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <FileCode2 size={13} strokeWidth={2.4} />
                  <span>Files (14)</span>
                </button>

                <button
                  type="button"
                  id="ws-open-fleet-btn"
                  onClick={() => {
                    handleSound();
                    setAgentsInspectorOpen(true);
                  }}
                  className="h-8 px-2.5 border-2 border-[#000F1D] bg-white dark:bg-[#1C2030] font-black uppercase text-[10px] sm:text-[11px] rounded flex items-center gap-1.5 shadow-[1.5px_1.5px_0_#000F1D] hover:bg-[#00F0FF] hover:text-black active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <Bot size={13} strokeWidth={2.4} />
                  <span>Fleet (5)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setShowMomentCard(true);
                  }}
                  className="h-8 px-2.5 border-2 border-[#000F1D] bg-white dark:bg-[#1C2030] font-black uppercase text-[10px] sm:text-[11px] rounded flex items-center gap-1.5 shadow-[1.5px_1.5px_0_#000F1D] hover:bg-[#55DB9C] hover:text-black active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <Sparkles size={13} strokeWidth={2.4} />
                  <span className="hidden sm:inline">Milestone</span>
                </button>

                {/* Switch Workspace Button */}
                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setProjectSwitcherOpen(true);
                  }}
                  className="h-8 px-2.5 border-2 border-neutral-900 dark:border-white/80 bg-white dark:bg-[#1E1E28] rounded font-mono text-[10px] sm:text-[11px] font-black uppercase shadow-[1.5px_1.5px_0_#000] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Folder size={12} strokeWidth={2.5} />
                  <span className="hidden md:inline">Switch</span>
                  <ChevronDown size={11} strokeWidth={2.5} />
                </button>

                {/* Audio Toggle */}
                <button
                  type="button"
                  onClick={() => setSoundEnabled((v) => !v)}
                  title={soundEnabled ? "Mute audio" : "Unmute audio"}
                  className="h-8 w-8 border-2 border-neutral-900 dark:border-white/80 bg-white dark:bg-[#1E1E28] rounded shadow-[1.5px_1.5px_0_#000] active:translate-y-0.5 active:shadow-none flex items-center justify-center cursor-pointer"
                >
                  {soundEnabled ? (
                    <Volume2 size={14} className="text-neutral-900 dark:text-white" />
                  ) : (
                    <VolumeX size={14} className="text-neutral-400" />
                  )}
                </button>
              </div>
            </div>

            {/* =========================================================================
                3. CENTRAL WORKSPACE STAGE CANVAS & SURFACES
            ========================================================================= */}
            <div className="border-2 border-[#000F1D] bg-white dark:bg-[#101422] rounded-2xl shadow-[4px_4px_0_#000F1D] overflow-hidden min-h-[580px] flex flex-col">
              {/* Surface Header Bar */}
              <div className="h-11 px-4 border-b-2 border-[#000F1D] bg-[#FAF7F2] dark:bg-[#181D2D] flex items-center justify-between font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-black uppercase tracking-wider text-[#000F1D] dark:text-white flex items-center gap-1.5">
                    {activeSurface === "canvas" && <Layers size={14} className="text-[#1D4ED8]" />}
                    {activeSurface === "code" && <Code2 size={14} className="text-[#1D4ED8]" />}
                    {activeSurface === "visual" && <Eye size={14} className="text-[#1D4ED8]" />}
                    {activeSurface === "debug" && <Bug size={14} className="text-[#1D4ED8]" />}
                    {activeSurface === "agents" && <Bot size={14} className="text-[#1D4ED8]" />}
                    {activeSurface === "deploy" && <Rocket size={14} className="text-[#1D4ED8]" />}
                    <span>
                      {activeSurface === "canvas" && "System Architecture Canvas (DAG)"}
                      {activeSurface === "code" && `Code Studio · ${activeFilePath}`}
                      {activeSurface === "visual" && "Edge Runtime Live Prototype"}
                      {activeSurface === "debug" && "Vitest Autonomous Assertion Suite"}
                      {activeSurface === "agents" && "Autonomous Specialist Agent Swarm"}
                      {activeSurface === "deploy" && "Multi-Region Edge Cloud Distribution"}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {activeSurface === "code" && (
                    <button
                      type="button"
                      onClick={() => setFilesExplorerOpen(true)}
                      className="px-2 py-1 bg-white dark:bg-[#252A3D] border border-black dark:border-white/50 rounded font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <FolderTree size={12} />
                      <span>Browse Files</span>
                    </button>
                  )}

                  {activeSurface === "visual" && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400 font-bold rounded text-[10px]">
                      LIVE PREVIEW
                    </span>
                  )}

                  <span className="text-neutral-400 font-bold hidden sm:inline">
                    {projectName.toUpperCase()} · STABLE
                  </span>
                </div>
              </div>

              {/* Surface Workspace Content */}
              <div className="flex-1 min-h-[500px] relative overflow-hidden bg-[#FAF7F2] dark:bg-[#0E121E]">
                {/* 1. Canvas Mode */}
                {activeSurface === "canvas" && (
                  <ForgeBuildCanvas
                    buildPrompt={activeGoal}
                    customNodes={activeDagNodes}
                    onSelectNodeFile={(file: string) => {
                      setActiveFilePath(file);
                      setActiveSurface("code");
                    }}
                    onOpenPreview={() => setActiveSurface("visual")}
                  />
                )}

                {/* 2. Code Studio Mode */}
                {activeSurface === "code" && (
                  <div className="h-full flex flex-col md:flex-row min-h-[500px]">
                    {/* Left Mini File Tree Bar */}
                    <div className="w-full md:w-64 border-b-2 md:border-b-0 md:border-r-2 border-[#000F1D] bg-[#F6F4EE] dark:bg-[#141828] p-3 font-mono text-xs flex flex-col shrink-0">
                      <div className="font-black uppercase tracking-wider text-neutral-600 dark:text-neutral-400 text-[10px] pb-2 flex items-center justify-between">
                        <span>REPOSITORY TREE</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{Object.keys(projectFiles).length} FILES</span>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-1">
                        {projectTree.map((node) => {
                          if (node.type === "folder") {
                            const isOpen = openFolders[node.name] ?? false;
                            return (
                              <div key={node.name} className="space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => toggleFolder(node.name)}
                                  className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 text-left font-bold rounded"
                                >
                                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  {isOpen ? (
                                    <FolderOpen size={13} className="text-amber-500" />
                                  ) : (
                                    <Folder size={13} className="text-neutral-500" />
                                  )}
                                  <span>{node.name}</span>
                                </button>

                                {isOpen && node.children && (
                                  <div className="pl-4 border-l border-neutral-300 dark:border-neutral-700 ml-2 space-y-0.5">
                                    {node.children.map((child) => (
                                      <div key={child.name}>
                                        {child.type === "folder" ? (
                                          <div className="pl-1 space-y-0.5">
                                            <span className="text-[10px] font-bold text-neutral-400">
                                              📁 {child.name}
                                            </span>
                                            {child.children?.map((sub) => (
                                              <button
                                                key={sub.path}
                                                type="button"
                                                onClick={() => handleSelectFile(sub.path)}
                                                className={`w-full flex items-center justify-between px-2 py-1 rounded text-left font-medium transition-colors ${
                                                  activeFilePath === sub.path
                                                    ? "bg-[#1A1A1A] text-white dark:bg-white dark:text-black font-bold"
                                                    : "hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                                                }`}
                                              >
                                                <span className="truncate">📄 {sub.name}</span>
                                                {sub.badge && (
                                                  <span
                                                    className={`text-[9px] font-bold px-1 rounded ${
                                                      sub.badgeColor || "bg-neutral-200 text-black"
                                                    }`}
                                                  >
                                                    {sub.badge}
                                                  </span>
                                                )}
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleSelectFile(child.path)}
                                            className={`w-full flex items-center justify-between px-2 py-1 rounded text-left font-medium transition-colors ${
                                              activeFilePath === child.path
                                                ? "bg-[#1A1A1A] text-white dark:bg-white dark:text-black font-bold"
                                                : "hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                                            }`}
                                          >
                                            <span className="truncate">📄 {child.name}</span>
                                            {child.badge && (
                                              <span
                                                className={`text-[9px] font-bold px-1 rounded ${
                                                  child.badgeColor || "bg-neutral-200 text-black"
                                                }`}
                                              >
                                                {child.badge}
                                              </span>
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return (
                            <button
                              key={node.path}
                              type="button"
                              onClick={() => handleSelectFile(node.path)}
                              className={`w-full flex items-center justify-between px-2 py-1 rounded text-left font-medium transition-colors ${
                                activeFilePath === node.path
                                  ? "bg-[#1A1A1A] text-white dark:bg-white dark:text-black font-bold"
                                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                              }`}
                            >
                              <span className="truncate">📄 {node.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Monaco Code Editor Stage */}
                    <div className="flex-1 min-h-[450px]">
                      <ForgeCodeSurface initialFile={activeFilePath} files={projectFiles} />
                    </div>
                  </div>
                )}

                {/* 3. Live Visual Preview Mode */}
                {activeSurface === "visual" && (
                  <ForgeVisualSurface />
                )}

                {/* 4. QA Tests Mode */}
                {activeSurface === "debug" && (
                  <ForgeDebugSurface />
                )}

                {/* 5. Living Agent Swarm Fleet Mode */}
                {activeSurface === "agents" && (
                  <div className="p-4 sm:p-6 font-mono text-xs space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#000F1D] pb-3">
                      <div>
                        <h2 className="text-base sm:text-lg font-black uppercase text-neutral-900 dark:text-white flex items-center gap-2">
                          <Bot className="text-[#1D4ED8]" />
                          <span>Autonomous Multi-Agent Fleet</span>
                        </h2>
                        <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">
                          5 specialized AI agents collaborating in real-time on architecture, code, testing, security, and edge deployment.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400 rounded font-bold text-xs">
                          ● ALL SWARMS SYNCHRONIZED
                        </span>
                      </div>
                    </div>

                    {/* Agent Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {LIVING_AGENTS_DATA.map((agent) => (
                        <div
                          key={agent.name}
                          className="border-2 border-[#000F1D] bg-white dark:bg-[#181E30] rounded-xl p-4 shadow-[3px_3px_0_#000F1D] space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm uppercase text-neutral-900 dark:text-white">
                              {agent.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 border border-black font-black text-[10px] rounded ${agent.color} text-black`}
                            >
                              {agent.token}
                            </span>
                          </div>

                          <div className="text-neutral-600 dark:text-neutral-400 text-xs font-semibold">
                            {agent.role}
                          </div>

                          <div className="p-2.5 bg-neutral-50 dark:bg-[#111522] border border-neutral-200 dark:border-neutral-800 rounded text-[11px] space-y-1">
                            <div className="text-neutral-500 font-bold">CURRENT DIRECTIVE:</div>
                            <div className="text-neutral-800 dark:text-neutral-200 font-medium">
                              {agent.task}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 text-[11px] border-t border-neutral-200 dark:border-neutral-800">
                            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                              {agent.status}
                            </span>
                            <span className="font-bold text-neutral-500">
                              Conf: {agent.confidence}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. Deploy & Edge Mode */}
                {activeSurface === "deploy" && (
                  <ForgeDeploySurface projectName={projectName} />
                )}
              </div>
            </div>

            {/* =========================================================================
                4. NEO-BRUTALIST BOTTOM COMMAND DECK & TERMINAL
            ========================================================================= */}
            <div
              id="workspace-command-deck"
              className="border-2 border-[#000F1D] bg-[#0C0D10] text-[#E0E0E0] rounded-xl p-3 sm:p-4 shadow-[4px_4px_0_#000F1D] font-mono select-none space-y-3"
            >
              {/* Terminal Command Bar Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-black text-[#00F59B] flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#00F59B] animate-pulse" />
                    C:\FORGE_OS\{projectName.toUpperCase().replace(/\s+/g, "_")}&gt;
                  </span>
                  <span className="text-neutral-400 hidden sm:inline text-[11px]">
                    AUTONOMOUS SWARM READY
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle Logs Viewer */}
                  <button
                    type="button"
                    onClick={() => {
                      handleSound(750);
                      setLogsExpanded((prev) => !prev);
                    }}
                    className={`h-7 px-3 border-2 border-white/40 text-[10px] font-mono font-black uppercase rounded transition-none active:translate-x-0.5 active:translate-y-0.5 cursor-pointer shadow-[1px_1px_0_#000] flex items-center ${
                      logsExpanded
                        ? "bg-[#00F0FF] text-black border-black"
                        : "bg-transparent text-white hover:bg-white/10"
                    }`}
                  >
                    {logsExpanded ? "▼ HIDE LOGS" : "▲ SHOW AGENT LOGS (5)"}
                  </button>

                  {/* Prompt Execution Mode */}
                  <select
                    value={promptMode}
                    onChange={(e) => setPromptMode(e.target.value as any)}
                    className="h-7 bg-[#181820] text-white border-2 border-white/40 text-[10px] font-mono font-black px-2 rounded outline-none cursor-pointer shadow-[1px_1px_0_#000]"
                  >
                    <option value="synthesis">MODE: SYNTHESIS</option>
                    <option value="refactor">MODE: REFACTOR</option>
                    <option value="test">MODE: QA TEST</option>
                    <option value="debug">MODE: FIX BUG</option>
                  </select>
                </div>
              </div>

              {/* Optional Expandable Terminal Stream Output */}
              {logsExpanded && (
                <div className="p-3 bg-black border-2 border-white/20 rounded max-h-44 overflow-y-auto space-y-1.5 text-xs text-[#A0A0A8] shadow-[2px_2px_0_#000]">
                  {logsList.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-neutral-500 shrink-0">[{log.time}]</span>
                      <span className="text-[#00F0FF] font-bold shrink-0">&lt;{log.agent}&gt;</span>
                      <span className={log.level === "success" ? "text-[#00F59B]" : "text-neutral-200"}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Command Prompt Form Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(intentInput);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1 h-10 flex items-center border-2 border-white/60 bg-[#16161C] rounded shadow-[2px_2px_0_#000]">
                  <span className="pl-3 pr-1 text-[#00F59B] font-black text-sm select-none">&gt;</span>
                  <input
                    type="text"
                    id="ws-command-input"
                    value={intentInput}
                    onChange={(e) => setIntentInput(e.target.value)}
                    placeholder="Direct the autonomous swarm (e.g. 'google map', 'Add Stripe webhook', 'Run Vitest suite')..."
                    className="w-full h-full px-2 bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 outline-none font-mono font-medium"
                  />
                  <div className="pr-2">
                    <VoiceInputButton
                      variant="inline-sm"
                      currentValue={intentInput}
                      onTextCaptured={(text) => {
                        setIntentInput((prev) => (prev ? `${prev} ${text}` : text));
                        toast.success("Voice transcribed");
                      }}
                    />
                  </div>
                </div>

                {/* Tactile Physical Push Button */}
                <button
                  type="submit"
                  id="ws-execute-btn"
                  disabled={!intentInput.trim() || isBuilding}
                  className="h-10 px-5 bg-[#FFD731] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-black border-2 border-black rounded font-mono font-black text-xs uppercase shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 flex items-center gap-2 shrink-0 cursor-pointer transition-all"
                >
                  {isBuilding ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>SYNTHESIZING...</span>
                    </>
                  ) : (
                    <>
                      <span>EXECUTE ↵</span>
                      <ArrowRight size={14} strokeWidth={3} />
                    </>
                  )}
                </button>
              </form>

              {/* Refinement Suggestions Chips */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-[11px] pt-1">
                <span className="text-neutral-400 font-bold shrink-0">DIRECTIVES:</span>
                {[
                  "Integrate Google Maps with interactive pins",
                  "Add Stripe webhook signature verification",
                  "Execute Vitest suite (42 assertions)",
                  "Generate mock seed data",
                  "Deploy to global Edge network",
                  "Add Redis sliding-window rate limiter",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSubmit(chip)}
                    className="h-7 shrink-0 px-2.5 bg-[#202028] hover:bg-[#FFD731] hover:text-black hover:border-black border border-white/30 text-neutral-200 font-mono font-bold rounded active:translate-x-0.5 active:translate-y-0.5 transition-none flex items-center cursor-pointer"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SuiWindowFrame>
      </div>

      {/* =========================================================================
          AUXILIARY FLOATING NEO-BRUTALIST MODALS:
          1. FILES_EXPLORER.SYS
          2. LIVING_AGENTS.SYS
          3. SWITCH_PROJECT.EXE
          4. ARTIFACT MOMENT CARD
      ========================================================================= */}

      {/* 1. Files Explorer Modal */}
      {filesExplorerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-[#FAF7F2] dark:bg-[#121624] border-2 border-[#000F1D] rounded-2xl shadow-[6px_6px_0_#000F1D] overflow-hidden flex flex-col h-[520px]">
            {/* Modal Header */}
            <div className="h-12 px-4 bg-[#4DA2FE] text-white border-b-2 border-[#000F1D] flex items-center justify-between font-mono font-bold text-xs">
              <span className="flex items-center gap-2">
                <FolderTree size={16} />
                <span>FILES_EXPLORER.SYS - [{projectName}]</span>
              </span>
              <button
                type="button"
                onClick={() => setFilesExplorerOpen(false)}
                className="w-7 h-7 bg-white text-black border-2 border-[#000F1D] rounded flex items-center justify-center font-black hover:bg-neutral-200"
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col font-mono text-xs space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-3 text-neutral-400" />
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  placeholder="Filter repository files..."
                  className="w-full pl-8 pr-3 py-2 border-2 border-[#000F1D] rounded-lg bg-white dark:bg-[#1A1E2E] text-xs font-mono outline-none shadow-[2px_2px_0_#000F1D]"
                />
              </div>

              {/* File Tree Container */}
              <div className="flex-1 overflow-y-auto border-2 border-[#000F1D] rounded-lg p-3 bg-white dark:bg-[#161A28] space-y-1">
                {projectTree.map((node) => {
                  const isFolder = node.type === "folder";
                  const isOpen = openFolders[node.name] ?? false;

                  if (isFolder) {
                    return (
                      <div key={node.name} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => toggleFolder(node.name)}
                          className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left font-black rounded"
                        >
                          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {isOpen ? (
                            <FolderOpen size={14} className="text-amber-500" />
                          ) : (
                            <Folder size={14} className="text-neutral-400" />
                          )}
                          <span>{node.name}</span>
                        </button>

                        {isOpen && node.children && (
                          <div className="pl-4 border-l-2 border-neutral-300 dark:border-neutral-700 ml-2 space-y-0.5">
                            {node.children.map((child) => {
                              if (child.type === "folder") {
                                return (
                                  <div key={child.name} className="pl-2 space-y-0.5">
                                    <span className="font-bold text-neutral-400">📁 {child.name}</span>
                                    {child.children?.map((subfile) => (
                                      <button
                                        key={subfile.path}
                                        type="button"
                                        onClick={() => handleSelectFile(subfile.path)}
                                        className="w-full flex items-center justify-between px-2 py-1 hover:bg-[#FFD731] hover:text-black rounded text-left font-bold"
                                      >
                                        <span>📄 {subfile.name}</span>
                                        {subfile.badge && (
                                          <span
                                            className={`text-[9px] font-black px-1 rounded border border-black ${
                                              subfile.badgeColor || "bg-neutral-200 text-black"
                                            }`}
                                          >
                                            {subfile.badge}
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={child.path}
                                  type="button"
                                  onClick={() => handleSelectFile(child.path)}
                                  className="w-full flex items-center justify-between px-2 py-1 hover:bg-[#FFD731] hover:text-black rounded text-left font-bold"
                                >
                                  <span>📄 {child.name}</span>
                                  {child.badge && (
                                    <span
                                      className={`text-[9px] font-black px-1 rounded border border-black ${
                                        child.badgeColor || "bg-neutral-200 text-black"
                                      }`}
                                    >
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
                  }

                  return (
                    <button
                      key={node.path}
                      type="button"
                      onClick={() => handleSelectFile(node.path)}
                      className="w-full flex items-center justify-between px-2 py-1 hover:bg-[#FFD731] hover:text-black rounded text-left font-bold"
                    >
                      <span>📄 {node.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Living Agents Inspector Modal */}
      {agentsInspectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-[#FAF7F2] dark:bg-[#121624] border-2 border-[#000F1D] rounded-2xl shadow-[6px_6px_0_#000F1D] overflow-hidden flex flex-col h-[520px]">
            {/* Modal Header */}
            <div className="h-12 px-4 bg-[#FF7A00] text-white border-b-2 border-[#000F1D] flex items-center justify-between font-mono font-bold text-xs">
              <span className="flex items-center gap-2">
                <Bot size={16} />
                <span>LIVING_AGENTS.SYS · 5 ACTIVE SWARMS</span>
              </span>
              <button
                type="button"
                onClick={() => setAgentsInspectorOpen(false)}
                className="w-7 h-7 bg-white text-black border-2 border-[#000F1D] rounded flex items-center justify-center font-black hover:bg-neutral-200"
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs space-y-3">
              {LIVING_AGENTS_DATA.map((agent) => (
                <div
                  key={agent.name}
                  className="p-3 border-2 border-[#000F1D] bg-white dark:bg-[#1A1E2E] rounded-xl shadow-[2px_2px_0_#000F1D] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm uppercase">{agent.name}</span>
                    <span
                      className={`px-2 py-0.5 border border-black font-black text-[9px] rounded ${agent.color} text-black`}
                    >
                      {agent.token}
                    </span>
                  </div>
                  <div className="text-neutral-500 text-xs">{agent.role}</div>
                  <div className="text-[11px] text-neutral-700 dark:text-neutral-300 font-medium bg-neutral-100 dark:bg-neutral-800 p-2 rounded">
                    {agent.task}
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                      {agent.status}
                    </span>
                    <span className="text-neutral-500 font-bold">Confidence: {agent.confidence}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Project Switcher Modal */}
      {projectSwitcherOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-[#FAF7F2] dark:bg-[#121624] border-2 border-[#000F1D] rounded-2xl shadow-[6px_6px_0_#000F1D] overflow-hidden flex flex-col h-[460px]">
            {/* Modal Header */}
            <div className="h-12 px-4 bg-[#FFD731] text-black border-b-2 border-[#000F1D] flex items-center justify-between font-mono font-black text-xs">
              <span className="flex items-center gap-2">
                <Folder size={16} />
                <span>SWITCH_WORKSPACE.EXE</span>
              </span>
              <button
                type="button"
                onClick={() => setProjectSwitcherOpen(false)}
                className="w-7 h-7 bg-white text-black border-2 border-[#000F1D] rounded flex items-center justify-center font-black hover:bg-neutral-200"
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between font-mono text-xs space-y-3">
              <div className="space-y-2 overflow-y-auto flex-1">
                <div className="text-[10px] font-black uppercase text-neutral-500 pb-1">
                  AVAILABLE WORKSPACES ({allProjectsList.length}):
                </div>
                {allProjectsList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      handleSound();
                      setProject({
                        id: p.id,
                        name: p.displayName || p.name,
                        displayName: p.displayName || p.name,
                        description: p.description,
                        techStack: p.techStack,
                        agents: p.agents,
                        fileTree: p.fileTree,
                      });
                      navigate(`/build/${p.id}`);
                      setProjectSwitcherOpen(false);
                      toast.success(`Switched to ${p.displayName || p.name}`);
                    }}
                    className={`w-full p-2.5 border-2 border-[#000F1D] rounded-lg text-left font-bold shadow-[2px_2px_0_#000F1D] transition-all cursor-pointer ${
                      p.id === project?.id
                        ? "bg-[#FFD731] text-black"
                        : "bg-white dark:bg-[#1E2336] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <div className="font-black uppercase text-xs">{p.displayName || p.name}</div>
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                      {p.description}
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t-2 border-[#000F1D]">
                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    navigate("/projects");
                    setProjectSwitcherOpen(false);
                  }}
                  className="w-full py-2.5 bg-[#1A1A1A] hover:bg-black text-white dark:bg-white dark:text-black font-black uppercase text-xs rounded-lg border-2 border-[#000F1D] shadow-[2px_2px_0_#000F1D] active:translate-y-0.5 active:shadow-none cursor-pointer"
                >
                  Manage All Workspaces in Projects Hub →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Artifact Moment Card Modal */}
      <AnimatePresence>
        {showMomentCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close artifact preview backdrop"
              className="fixed inset-0 bg-black/60 cursor-default w-full h-full border-none"
              onClick={() => setShowMomentCard(false)}
            />
            <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-xl">
              <ForgeMomentCard
                title={`${projectName} v2.4 Runtime Synthesis`}
                filesChangedCount={14}
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
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
