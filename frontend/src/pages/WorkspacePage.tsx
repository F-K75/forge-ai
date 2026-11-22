import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Terminal,
  Folder,
  FolderOpen,
  FileCode2,
  ChevronRight,
  ChevronDown,
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
  RefreshCw,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useBuildStore } from "../store/buildStore";
import { useBuildSocket } from "../hooks/useBuildSocket";
import { runMockBuild } from "../lib/mockEmitter";
import { buildsApi, projectsApi } from "../lib/api";
import { findProjectById } from "../lib/mockData";
import { LIVE_MODE } from "../lib/env";
import { SuiWindowFrame, BottomNavItem } from "../components/pm/SuiWindowFrame";
import { VoiceInputButton } from "../components/pm/VoiceInputButton";
import { ForgeBuildCanvas } from "../components/forge-os/ForgeBuildCanvas";
import { ForgeCodeSurface } from "../components/forge-os/ForgeCodeSurface";
import { ForgeVisualSurface } from "../components/forge-os/ForgeVisualSurface";
import { ForgeDebugSurface } from "../components/forge-os/ForgeDebugSurface";
import { ForgeDeploySurface } from "../components/forge-os/ForgeDeploySurface";
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
    color: "bg-warn",
    token: "1.9k tokens",
    confidence: "97.8%",
    task: "Edge cold start < 18ms across SFO, IAD, LHR, FRA, HND",
  },
];

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSound = useCallback((pitch = 880) => {
    synth.playClick(pitch);
  }, []);

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
          initialFiles: (found as any).initialFiles,
        } as WorkspaceProject & { initialFiles?: Array<{ path: string; content: string }> }
      : {
          id: "proj-001",
          name: "habit-tracker",
          displayName: "Habit Tracker Pro",
          description: "Daily habit tracking with streaks, heatmaps, and reminders.",
          techStack: ["React 19", "TypeScript", "TailwindCSS", "Vitest", "Edge"],
          agents: ["architect", "developer", "pm", "integration"],
        };
  });

  const [filesExplorerOpen, setFilesExplorerOpen] = useState(false);
  const [agentsInspectorOpen, setAgentsInspectorOpen] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
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

  // Prompt & build state
  const [intentInput, setIntentInput] = useState("");
  const [activeGoal, setActiveGoal] = useState<string>(() => {
    if (project?.description) return project.description;
    if (project?.displayName) return `Build and scale ${project.displayName}`;
    return "Build full-stack workspace application";
  });
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>(DEFAULT_WORKSPACE_FILES);
  const [projectTree, setProjectTree] = useState<TreeNode[]>(INITIAL_PROJECT_TREE);
  const [activeDagNodes, setActiveDagNodes] = useState<CanvasNode[] | undefined>(undefined);
  const [logsList, setLogsList] = useState(STREAMING_LOGS);
  const [isBuilding, setIsBuilding] = useState(false);

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
          // The create response is {build_id, status}; reading b.id left the
          // socket subscribed to nothing (F15).
          startBuild(b.build_id, textToSubmit, b);
          setBuildId(b.build_id);
          toast.success("Build job dispatched to autonomous agents");
        })
        .catch(() => {
          toast.error("Failed to start build job");
        });
    }

    try {
      toast.loading(`Live Gemini swarm synthesizing: "${textToSubmit.slice(0, 32)}..."`, { id: "build-toast" });

      const result = await synthesizeCodeForPrompt(textToSubmit, projectFiles, {
        mode: "synthesis",
        projectName: project?.displayName || project?.name || "Forge Project",
        existingFiles: Object.keys(projectFiles),
      });

      const newFilesMap: Record<string, string> = { ...projectFiles };
      result.files.forEach((f) => {
        newFilesMap[f.path] = f.content;
      });
      setProjectFiles(newFilesMap);
      setProjectTree((prev) => addSynthesizedFilesToTree(prev, result.files));
      setOpenFolders((prev) => ({
        ...prev,
        components: true,
        api: true,
        types: true,
        tests: true,
        src: true,
      }));

      if (result.primaryFile) {
        setActiveFilePath(result.primaryFile);
      }
      if (result.dagNodes && result.dagNodes.length > 0) {
        setActiveDagNodes(result.dagNodes);
      }
      if (result.logs && result.logs.length > 0) {
        setLogsList((prev) => [...result.logs, ...prev]);
      }

      setActiveSurface("code");
      setIsBuilding(false);
      synth.playSwitch();
      const provenance = result.model
        ? ` via ${result.model}${result.usage?.totalTokens ? ` (${result.usage.totalTokens.toLocaleString()} tokens)` : ""}`
        : "";
      toast.success(
        `Synthesized ${result.files.length} files${provenance}.`,
        { id: "build-toast" }
      );
    } catch (err: any) {
      setIsBuilding(false);
      toast.error(err?.message || "Failed to synthesize code.", { id: "build-toast" });
    }
  };

  const projectName = project?.displayName || project?.name || "Workspace";

  const filteredFilePaths = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase();
    if (!q) return null;
    return Object.keys(projectFiles).filter((p) => p.toLowerCase().includes(q));
  }, [fileSearchQuery, projectFiles]);

  const navItems: BottomNavItem[] = useMemo(() => {
    return [
      {
        id: "canvas",
        label: "Canvas",
        icon: <Layers size={14} className="shrink-0" />,
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
        isActive: activeSurface === "code",
        onClick: () => {
          handleSound();
          setActiveSurface("code");
        },
      },
      {
        id: "visual",
        label: "Preview",
        icon: <Eye size={14} className="shrink-0" />,
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
        isActive: activeSurface === "agents",
        onClick: () => {
          handleSound();
          setActiveSurface("agents");
        },
      },
      {
        id: "deploy",
        label: "Deploy",
        icon: <Rocket size={14} className="shrink-0" />,
        isActive: activeSurface === "deploy",
        onClick: () => {
          handleSound();
          setActiveSurface("deploy");
        },
      },
      {
        id: "all-workspaces",
        label: "Projects",
        icon: <ArrowLeft size={14} className="shrink-0" />,
        onClick: () => {
          handleSound();
          navigate("/projects");
        },
      },
    ];
  }, [activeSurface, handleSound, navigate]);

  return (
    <div className="relative min-h-screen w-full bg-base p-2 sm:p-3 font-sans antialiased text-ink flex flex-col">
      <div className="w-full flex-1 flex flex-col">
        <SuiWindowFrame
          title={projectName}
          navPosition="top"
          navItems={navItems}
          topRightContent={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-ok">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                  Edge Live · Ready
                </span>
                <span className="hidden sm:inline text-muted">42/42 Vitest passed</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="ws-open-files-btn"
                  onClick={() => {
                    handleSound();
                    setFilesExplorerOpen(true);
                  }}
                  className="h-8 px-2.5 rounded-lg border border-border bg-panel-alt hover:bg-base text-ink text-xs font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
                >
                  <FileCode2 size={13} className="text-muted" />
                  <span className="tabular-nums">Files ({Object.keys(projectFiles).length})</span>
                </button>

                <button
                  type="button"
                  id="ws-open-fleet-btn"
                  onClick={() => {
                    handleSound();
                    setAgentsInspectorOpen(true);
                  }}
                  className="h-8 px-2.5 rounded-lg border border-border bg-panel-alt hover:bg-base text-ink text-xs font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
                >
                  <Bot size={13} className="text-muted" />
                  <span>Fleet</span>
                </button>
              </div>
            </div>
          }
        >
          <div className="flex-1 flex flex-col gap-3 min-h-[calc(100vh-148px)]">
            {/* Primary Workspace Surface */}
            <div className="flex-1 rounded-xl border border-border bg-panel shadow-apple overflow-hidden min-h-[540px] flex flex-col">
              {/* Minimal Surface Title Bar */}
              <div className="h-9 px-4 border-b border-border bg-panel-alt flex items-center justify-between gap-2 shrink-0">
                <span className="text-xs font-medium text-ink truncate">
                  {activeSurface === "canvas" && "System Architecture Canvas (DAG)"}
                  {activeSurface === "code" && `Code Studio · ${activeFilePath}`}
                  {activeSurface === "visual" && "Live Preview"}
                  {activeSurface === "debug" && "Vitest Autonomous Assertion Suite"}
                  {activeSurface === "agents" && "Autonomous Multi-Agent Fleet"}
                  {activeSurface === "deploy" && "Edge Deployment"}
                </span>

                {activeSurface === "agents" && (
                  <button
                    type="button"
                    onClick={() => navigate("/studio-3d")}
                    className="h-6 px-2 rounded-md border border-border bg-panel hover:bg-base text-[11px] font-medium text-ink inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <span>3D Topology</span>
                    <ArrowUpRight size={12} className="text-muted" />
                  </button>
                )}
              </div>

              {/* Active Surface Body */}
              <div className="flex-1 min-h-[500px] relative overflow-hidden bg-base">
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

                {activeSurface === "code" && (
                  <div className="h-full min-h-[500px]">
                    <ForgeCodeSurface initialFile={activeFilePath} files={projectFiles} />
                  </div>
                )}

                {activeSurface === "visual" && <ForgeVisualSurface />}

                {activeSurface === "debug" && <ForgeDebugSurface />}

                {activeSurface === "agents" && (
                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {LIVING_AGENTS_DATA.map((agent) => (
                        <div
                          key={agent.name}
                          className="rounded-xl border border-border bg-panel p-4 shadow-apple flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="font-display font-semibold text-sm text-ink">
                              {agent.name}
                            </div>
                            <div className="text-xs text-muted">{agent.role}</div>
                          </div>

                          <div className="pt-2.5 border-t border-border text-xs font-mono text-ok inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />
                            {agent.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSurface === "deploy" && <ForgeDeploySurface projectName={projectName} />}
              </div>
            </div>

            {/* Minimal Bottom Prompt Bar */}
            <div
              id="workspace-command-deck"
              className="rounded-xl border border-border bg-[#0B0F19] text-slate-200 p-2.5 shadow-apple font-mono space-y-2.5 shrink-0"
            >
              {logsExpanded && (
                <div className="p-3 bg-black/50 border border-white/10 rounded-lg max-h-40 overflow-y-auto space-y-1.5 text-xs text-slate-300">
                  {logsList.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-slate-500 shrink-0 tabular-nums">[{log.time}]</span>
                      <span className="text-sky-400 font-medium shrink-0">&lt;{log.agent}&gt;</span>
                      <span
                        className={
                          log.level === "success" ? "text-emerald-400" : "text-slate-200"
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(intentInput);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1 h-10 flex items-center rounded-lg border border-white/15 bg-white/[0.04] focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/30 transition-colors">
                  <span className="pl-3 pr-1 text-emerald-400 font-semibold text-sm select-none">
                    &gt;
                  </span>
                  <input
                    type="text"
                    id="ws-command-input"
                    value={intentInput}
                    onChange={(e) => setIntentInput(e.target.value)}
                    placeholder="Describe a feature or change to synthesize..."
                    className="w-full h-full px-2 bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 outline-none font-mono"
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

                <button
                  type="button"
                  onClick={() => {
                    handleSound(750);
                    setLogsExpanded((prev) => !prev);
                  }}
                  title={logsExpanded ? "Hide logs" : "Show logs"}
                  className={`h-10 px-3 rounded-lg border text-xs font-sans font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                    logsExpanded
                      ? "bg-white/15 text-white border-white/25"
                      : "bg-white/5 text-slate-300 border-white/15 hover:bg-white/10"
                  }`}
                >
                  <Terminal size={13} />
                  <span className="hidden sm:inline tabular-nums">Logs ({logsList.length})</span>
                </button>

                <button
                  type="submit"
                  id="ws-execute-btn"
                  disabled={!intentInput.trim() || isBuilding}
                  className="h-10 px-4 rounded-lg bg-accent hover:bg-ember-glow text-white font-sans font-medium text-xs disabled:opacity-40 inline-flex items-center gap-2 shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {isBuilding ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <span>Run</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </SuiWindowFrame>
      </div>

      {/* Files Explorer Modal */}
      {filesExplorerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Files Explorer"
            className="w-full max-w-md rounded-xl bg-panel border border-border shadow-apple-lg overflow-hidden flex flex-col h-[480px]"
          >
            <div className="h-11 px-4 bg-panel-alt border-b border-border flex items-center justify-between">
              <span className="flex items-center gap-2 font-display font-semibold text-sm text-ink">
                <FolderTree size={15} className="text-accent" />
                <span>Files Explorer</span>
              </span>
              <button
                type="button"
                onClick={() => setFilesExplorerOpen(false)}
                aria-label="Close Files Explorer"
                className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink hover:bg-base flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3.5 flex-1 flex flex-col font-mono text-xs space-y-2.5 min-h-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full h-8 pl-8 pr-3 border border-border rounded-lg bg-panel-alt text-xs text-ink placeholder:text-faint outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                />
              </div>

              <div className="flex-1 overflow-y-auto border border-border rounded-lg p-2 bg-base/50 space-y-0.5">
                {filteredFilePaths ? (
                  filteredFilePaths.length === 0 ? (
                    <div className="p-4 text-center text-muted font-sans">No matching files</div>
                  ) : (
                    filteredFilePaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => handleSelectFile(path)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent-soft hover:text-accent text-ink rounded-md text-left transition-colors cursor-pointer"
                      >
                        <FileCode2 size={12} className="text-muted shrink-0" />
                        <span className="truncate">{path}</span>
                      </button>
                    ))
                  )
                ) : (
                  projectTree.map((node) => {
                    const isFolder = node.type === "folder";
                    const isOpen = openFolders[node.name] ?? false;

                    if (isFolder) {
                      return (
                        <div key={node.name} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => toggleFolder(node.name)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-panel text-left font-medium text-ink rounded-md transition-colors cursor-pointer"
                          >
                            {isOpen ? (
                              <ChevronDown size={12} className="text-muted" />
                            ) : (
                              <ChevronRight size={12} className="text-muted" />
                            )}
                            {isOpen ? (
                              <FolderOpen size={13} className="text-accent" />
                            ) : (
                              <Folder size={13} className="text-muted" />
                            )}
                            <span>{node.name}</span>
                          </button>

                          {isOpen && node.children && (
                            <div className="pl-4 border-l border-border ml-3 space-y-0.5">
                              {node.children.map((child) => {
                                if (child.type === "folder") {
                                  return (
                                    <div key={child.name} className="pl-1 space-y-0.5 pt-0.5">
                                      <span className="flex items-center gap-1.5 px-2 py-1 text-muted">
                                        <Folder size={12} />
                                        <span>{child.name}</span>
                                      </span>
                                      {child.children?.map((subfile) => (
                                        <button
                                          key={subfile.path}
                                          type="button"
                                          onClick={() => handleSelectFile(subfile.path)}
                                          className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent-soft hover:text-accent text-ink rounded-md text-left transition-colors cursor-pointer"
                                        >
                                          <FileCode2 size={12} className="text-muted shrink-0" />
                                          <span className="truncate">{subfile.name}</span>
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
                                    className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent-soft hover:text-accent text-ink rounded-md text-left transition-colors cursor-pointer"
                                  >
                                    <FileCode2 size={12} className="text-muted shrink-0" />
                                    <span className="truncate">{child.name}</span>
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
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent-soft hover:text-accent text-ink rounded-md text-left transition-colors cursor-pointer"
                      >
                        <FileCode2 size={12} className="text-muted shrink-0" />
                        <span className="truncate">{node.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Living Agents Modal */}
      {agentsInspectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Living Agents"
            className="w-full max-w-md rounded-xl bg-panel border border-border shadow-apple-lg overflow-hidden flex flex-col max-h-[480px]"
          >
            <div className="h-11 px-4 bg-panel-alt border-b border-border flex items-center justify-between">
              <span className="flex items-center gap-2 font-display font-semibold text-sm text-ink">
                <Bot size={15} className="text-accent" />
                <span>Living Agents</span>
              </span>
              <button
                type="button"
                onClick={() => setAgentsInspectorOpen(false)}
                aria-label="Close Living Agents"
                className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink hover:bg-base flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3.5 flex-1 overflow-y-auto divide-y divide-border">
              {LIVING_AGENTS_DATA.map((agent) => (
                <div key={agent.name} className="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-sm text-ink">{agent.name}</div>
                    <div className="text-xs text-muted">{agent.role}</div>
                  </div>
                  <span className="text-xs font-mono text-ok shrink-0">{agent.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
