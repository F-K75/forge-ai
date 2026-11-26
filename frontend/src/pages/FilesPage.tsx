import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import {
  FileCode2,
  Folder,
  FolderOpen,
  Search,
  GitBranch,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Trash2,
  Upload,
  Download,
  Save,
  Layers,
  Code2,
  X,
  FilePlus,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import toast from "react-hot-toast";
import BrandLogo from "../components/BrandLogo";
import { useBuildStore } from "../store/buildStore";
import { LIVE_MODE } from "../lib/env";
import { buildsApi, projectsApi } from "../lib/api";
import { useActiveProject } from "../hooks/useActiveProject";

export interface VirtualFile {
  path: string;
  name: string;
  folder: string;
  language: string;
  content: string;
  size: string;
  sizeBytes: number;
  lines: number;
  modified: string;
  isDirty?: boolean;
}

const DEFAULT_FILES: VirtualFile[] = [
  {
    path: "src/App.tsx",
    name: "App.tsx",
    folder: "src",
    language: "typescript",
    size: "2.4 KB",
    sizeBytes: 2450,
    lines: 32,
    modified: "10m ago",
    content: `import React, { useState } from 'react';
import { AgentOrchestrator } from './services/orchestrator';

export default function App() {
  const [status, setStatus] = useState<'idle' | 'running' | 'ready'>('ready');
  const [pipeline, setPipeline] = useState(['Architect', 'Developer', 'QA']);

  return (
    <div className="min-h-screen bg-base text-ink p-8 font-sans">
      <header className="flex items-center justify-between pb-6 border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Forge Workspace</h1>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-ok">
          Agent Fleet Active
        </span>
      </header>
      <main className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {pipeline.map((agent) => (
          <div key={agent} className="p-5 rounded-xl bg-panel border border-border shadow-apple">
            <h3 className="font-display font-semibold text-sm text-ink">{agent}</h3>
            <p className="text-xs font-sans text-muted mt-1">Autonomous worker initialized with frontier model weights.</p>
          </div>
        ))}
      </main>
    </div>
  );
}`,
  },
  {
    path: "src/services/orchestrator.ts",
    name: "orchestrator.ts",
    folder: "src/services",
    language: "typescript",
    size: "3.8 KB",
    sizeBytes: 3890,
    lines: 28,
    modified: "24m ago",
    content: `export interface AgentTask {
  id: string;
  role: 'architect' | 'developer' | 'qa' | 'devops';
  status: 'queued' | 'executing' | 'completed';
  payload: Record<string, unknown>;
}

export class AgentOrchestrator {
  private queue: AgentTask[] = [];

  async dispatch(task: AgentTask): Promise<void> {
    this.queue.push(task);
    // Parallel streaming dispatch across specialized LLM agents
    await Promise.all([
      this.routeToContextEngine(task),
      this.monitorGuardrails(task.id)
    ]);
  }

  private async routeToContextEngine(task: AgentTask) {
    return { tokenBudget: 32000, latencyMs: 140 };
  }

  private async monitorGuardrails(taskId: string) {
    return { passed: true, score: 0.99 };
  }
}`,
  },
  {
    path: "src/config/agents.json",
    name: "agents.json",
    folder: "src/config",
    language: "json",
    size: "1.1 KB",
    sizeBytes: 1120,
    lines: 12,
    modified: "1h ago",
    content: `{
  "fleet": [
    { "role": "Architect", "model": "gemini-2.5-pro", "temperature": 0.2 },
    { "role": "Developer", "model": "claude-3-7-sonnet", "temperature": 0.1 },
    { "role": "QA Specialist", "model": "gemini-2.5-flash", "temperature": 0.0 }
  ],
  "concurrencyLimit": 4,
  "autoHeal": true,
  "sandboxTimeoutSec": 60
}`,
  },
  {
    path: "src/styles/globals.css",
    name: "globals.css",
    folder: "src/styles",
    language: "css",
    size: "1.5 KB",
    sizeBytes: 1540,
    lines: 22,
    modified: "2h ago",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-mono: 'JetBrains Mono', monospace;
  --font-sans: 'Space Grotesk', sans-serif;
  --bg: #FFFFFF;
  --ink: #000000;
  --accent: #2DD4BF;
}

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
}`,
  },
  {
    path: "src/utils/tokenCounter.ts",
    name: "tokenCounter.ts",
    folder: "src/utils",
    language: "typescript",
    size: "1.2 KB",
    sizeBytes: 1240,
    lines: 18,
    modified: "4h ago",
    content: `export function estimateTokens(content: string): number {
  if (!content) return 0;
  // Standard heuristic: 1 token ~= 4 characters in code
  return Math.ceil(content.length / 3.8);
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return \`\${bytes} B\`;
  return \`\${(bytes / 1024).toFixed(1)} KB\`;
}`,
  }
];

function getLanguageFromPath(path: string): string {
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".sql")) return "sql";
  return "typescript";
}

export default function FilesPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store integration
  const storeFiles = useBuildStore((s) => s.files);
  const setStoreFiles = useBuildStore((s) => s.setFiles);

  // Local state for virtual files
  const [virtualFiles, setVirtualFiles] = useState<VirtualFile[]>(() => {
    // Live mode never shows the bundled sample files; real files come from
    // the project's latest build (loaded below) or the in-memory build store.
    const list: VirtualFile[] = LIVE_MODE ? [] : [...DEFAULT_FILES];
    if (storeFiles && Object.keys(storeFiles).length > 0) {
      Object.entries(storeFiles).forEach(([path, content]) => {
        if (!list.some((f) => f.path === path)) {
          const parts = path.split("/");
          const name = parts.pop() || path;
          const folder = parts.join("/") || "root";
          list.push({
            path,
            name,
            folder,
            language: getLanguageFromPath(path),
            content,
            size: `${(content.length / 1024).toFixed(1)} KB`,
            sizeBytes: content.length,
            lines: content.split("\n").length,
            modified: "just now",
          });
        }
      });
    }
    return list;
  });

  const [selectedPath, setSelectedPath] = useState<string>(LIVE_MODE ? "" : DEFAULT_FILES[0].path);
  const [currentContent, setCurrentContent] = useState<string>(LIVE_MODE ? "" : DEFAULT_FILES[0].content);
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { activeProjectId } = useActiveProject();
  const filesProjectId = routeProjectId || activeProjectId;
  const [liveFilesState, setLiveFilesState] = useState<"loading" | "ready" | "error">(
    LIVE_MODE ? "loading" : "ready"
  );

  // Live: load the files produced by this project's most recent build.
  useEffect(() => {
    if (!LIVE_MODE) return;
    if (!filesProjectId) {
      setLiveFilesState("ready");
      return;
    }
    let cancelled = false;
    setLiveFilesState("loading");
    projectsApi
      .getBuilds(filesProjectId)
      .then(async (builds: Array<{ id: string }>) => {
        const latest = builds?.[0];
        const files: Record<string, string> = latest ? await buildsApi.getFiles(latest.id) : {};
        if (cancelled) return;
        const list: VirtualFile[] = Object.entries(files || {}).map(([path, content]) => {
          const parts = path.split("/");
          const name = parts.pop() || path;
          return {
            path,
            name,
            folder: parts.join("/") || "root",
            language: getLanguageFromPath(path),
            content,
            size: `${(content.length / 1024).toFixed(1)} KB`,
            sizeBytes: content.length,
            lines: content.split("\n").length,
            modified: "latest build",
          };
        });
        setVirtualFiles(list);
        setSelectedPath(list[0]?.path ?? "");
        setLiveFilesState("ready");
      })
      .catch(() => {
        if (!cancelled) setLiveFilesState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [filesProjectId]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Modals state
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileTemplate, setNewFileTemplate] = useState<"blank" | "component" | "service" | "json">("component");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<VirtualFile | null>(null);

  // Selected file object
  const activeFile = useMemo(() => {
    return virtualFiles.find((f) => f.path === selectedPath) || virtualFiles[0];
  }, [virtualFiles, selectedPath]);

  // When activeFile changes, update currentContent
  useEffect(() => {
    if (activeFile) {
      setCurrentContent(activeFile.content);
      setIsDirty(false);
    }
  }, [activeFile]);

  // Group files by folder
  const foldersMap = useMemo(() => {
    const map: Record<string, VirtualFile[]> = {};
    virtualFiles.forEach((file) => {
      const folder = file.folder || "root";
      if (!map[folder]) map[folder] = [];
      map[folder].push(file);
    });
    return map;
  }, [virtualFiles]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    return virtualFiles.filter((file) => {
      const matchSearch =
        !search.trim() ||
        file.path.toLowerCase().includes(search.toLowerCase()) ||
        file.content.toLowerCase().includes(search.toLowerCase());

      const matchLang =
        languageFilter === "all" ||
        file.language === languageFilter ||
        (languageFilter === "typescript" && (file.language === "typescript" || file.language === "javascript"));

      return matchSearch && matchLang;
    });
  }, [virtualFiles, search, languageFilter]);

  // Folder collapse toggle
  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  // Copy active file content
  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    toast.success(`Copied ${activeFile.name} to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  // Save changes
  const handleSave = () => {
    setVirtualFiles((prev) =>
      prev.map((f) => {
        if (f.path === activeFile.path) {
          return {
            ...f,
            content: currentContent,
            sizeBytes: currentContent.length,
            size: `${(currentContent.length / 1024).toFixed(1)} KB`,
            lines: currentContent.split("\n").length,
            modified: "just now",
            isDirty: false,
          };
        }
        return f;
      })
    );

    // Sync with build store
    const updatedStoreFiles: Record<string, string> = {};
    virtualFiles.forEach((f) => {
      updatedStoreFiles[f.path] = f.path === activeFile.path ? currentContent : f.content;
    });
    setStoreFiles(updatedStoreFiles);

    setIsDirty(false);
    toast.success(`Saved changes to ${activeFile.name}`);
  };

  // Create new file
  const handleCreateFile = () => {
    if (!newFilePath.trim()) {
      toast.error("Please enter a file path");
      return;
    }

    const cleanPath = newFilePath.trim().replace(/^\/+/, "");
    if (virtualFiles.some((f) => f.path === cleanPath)) {
      toast.error("File already exists at this path");
      return;
    }

    let initialCode = "";
    const parts = cleanPath.split("/");
    const name = parts.pop() || cleanPath;
    const folder = parts.join("/") || "src";
    const lang = getLanguageFromPath(cleanPath);

    if (newFileTemplate === "component") {
      const compName = name.replace(/\.[^/.]+$/, "");
      initialCode = `import React from 'react';\n\nexport default function ${compName}() {\n  return (\n    <div className="p-4 rounded-sm border-2 border-border bg-panel">\n      <h2 className="font-mono text-lg font-semibold">${compName}</h2>\n    </div>\n  );\n}\n`;
    } else if (newFileTemplate === "service") {
      initialCode = `export class ServiceEngine {\n  async execute() {\n    return { success: true };\n  }\n}\n`;
    } else if (newFileTemplate === "json") {
      initialCode = `{\n  "name": "${name.replace(/\.[^/.]+$/, "")}",\n  "version": "1.0.0"\n}\n`;
    }

    const newFile: VirtualFile = {
      path: cleanPath,
      name,
      folder,
      language: lang,
      content: initialCode,
      size: `${(initialCode.length / 1024).toFixed(1)} KB`,
      sizeBytes: initialCode.length,
      lines: initialCode.split("\n").length,
      modified: "just now",
    };

    setVirtualFiles((prev) => [...prev, newFile]);
    setSelectedPath(cleanPath);
    setNewFileModalOpen(false);
    setNewFilePath("");
    toast.success(`Created ${cleanPath}`);
  };

  // Delete file
  const handleDeleteFile = () => {
    if (!fileToDelete) return;
    if (virtualFiles.length <= 1) {
      toast.error("Cannot delete the only file in the workspace");
      return;
    }

    const remaining = virtualFiles.filter((f) => f.path !== fileToDelete.path);
    setVirtualFiles(remaining);

    if (selectedPath === fileToDelete.path) {
      setSelectedPath(remaining[0].path);
    }

    setDeleteConfirmOpen(false);
    setFileToDelete(null);
    toast.success(`Deleted ${fileToDelete.name}`);
  };

  // Single file download
  const handleDownloadFile = (file: VirtualFile) => {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${file.name}`);
  };

  // Export all files as JSON manifest
  const handleExportAll = () => {
    const exportData = virtualFiles.map((f) => ({
      path: f.path,
      content: f.content,
      sizeBytes: f.sizeBytes,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forge-codebase-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${virtualFiles.length} files`);
  };

  // Handle uploaded files (drag & drop or file dialog)
  const processUploadedFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    let addedCount = 0;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || "";
        const cleanPath = `src/${file.name}`;
        const parts = cleanPath.split("/");
        const name = parts.pop() || cleanPath;
        const folder = parts.join("/") || "src";
        const lang = getLanguageFromPath(cleanPath);

        setVirtualFiles((prev) => {
          const filtered = prev.filter((f) => f.path !== cleanPath);
          return [
            ...filtered,
            {
              path: cleanPath,
              name,
              folder,
              language: lang,
              content: text,
              size: `${(text.length / 1024).toFixed(1)} KB`,
              sizeBytes: text.length,
              lines: text.split("\n").length,
              modified: "just now",
            },
          ];
        });

        addedCount++;
        if (addedCount === files.length) {
          setSelectedPath(cleanPath);
          toast.success(`Imported ${files.length} file(s) into workspace`);
        }
      };
      reader.readAsText(file);
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  // Total metrics
  const totalLOC = useMemo(() => {
    return virtualFiles.reduce((acc, f) => acc + f.lines, 0);
  }, [virtualFiles]);

  const totalBytes = useMemo(() => {
    return virtualFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  }, [virtualFiles]);

  const totalSizeFormatted = (totalBytes / 1024).toFixed(1);

  if (LIVE_MODE && !activeFile) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center bg-base text-ink">
        <h1 className="font-display text-xl font-semibold text-ink">Files</h1>
        <p className="max-w-md text-sm text-muted">
          {liveFilesState === "loading"
            ? "Loading files…"
            : liveFilesState === "error"
            ? "Couldn't load files for this project."
            : !filesProjectId
            ? "Create a project first — its generated files will show up here."
            : "No files yet. Run a build in the workspace and the generated files will appear here."}
        </p>
        {filesProjectId && liveFilesState !== "loading" && (
          <button
            type="button"
            onClick={() => navigate(`/p/${filesProjectId}/workspace`)}
            className="h-9 rounded-pill bg-ink hover:bg-ink/90 px-4 text-xs font-medium text-on-ink transition-colors cursor-pointer"
          >
            Open workspace
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-ink"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 1. Header Section */}
      <header className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <BrandLogo size="sm" />
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
                Codebase &amp; Virtual Files
              </h1>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                <GitBranch size={13} className="text-accent" />
                main
              </span>
            </div>
            <p className="text-sm text-muted">
              Inspect, modify, and create workspace files with live syntax validation and AST indexing.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => processUploadedFiles(e.target.files)}
              multiple
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-pill border border-border bg-panel hover:bg-panel-alt text-xs font-medium text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Upload size={13} className="text-muted" />
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={handleExportAll}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-pill border border-border bg-panel hover:bg-panel-alt text-xs font-medium text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Download size={13} className="text-muted" />
              <span>Export All</span>
            </button>

            <button
              type="button"
              onClick={() => setNewFileModalOpen(true)}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-pill bg-ink hover:bg-ink/90 text-on-ink text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Plus size={14} />
              <span>New File</span>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(filesProjectId ? `/p/${filesProjectId}/workspace` : "/workspace")
              }
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-pill border border-border bg-panel-alt hover:bg-base text-xs font-medium text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <span>Workspace</span>
              <ExternalLink size={12} className="text-muted" />
            </button>
          </div>
        </div>

        {/* 2. KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <FileCode2 size={14} className="text-accent" />
                Virtual Files
              </span>
              <span className="font-mono text-[11px] text-ok">Synced</span>
            </div>
            <p className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {virtualFiles.length}
            </p>
            <p className="text-xs text-muted">In active workspace store</p>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Code2 size={14} className="text-accent" />
                Code Volume
              </span>
              <span className="font-mono text-[11px] text-muted">LOC</span>
            </div>
            <p className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {totalLOC.toLocaleString()}
            </p>
            <p className="text-xs text-muted">Across all virtual modules</p>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Layers size={14} className="text-accent" />
                Bundle Footprint
              </span>
              <span className="font-mono text-[11px] text-ok">Clean</span>
            </div>
            <p className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {totalSizeFormatted} <span className="text-xs font-normal text-muted">KB</span>
            </p>
            <p className="text-xs text-muted">Zero dependency bloat</p>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-ok" />
                Language Engine
              </span>
              <span className="font-mono text-[11px] text-muted">TS 5.4</span>
            </div>
            <p className="font-display text-2xl font-semibold text-ink truncate">
              TypeScript
            </p>
            <p className="text-xs text-muted">Monaco LS syntax checking</p>
          </div>
        </div>
      </header>

      {/* 3. Drag and Drop Banner */}
      {isDraggingOver && (
        <div className="p-4 rounded-xl border border-dashed border-accent bg-accent-soft text-center text-sm font-medium text-accent">
          Drop code files here to import directly into the virtual filesystem
        </div>
      )}

      {/* 4. Main Two-Pane IDE Workbench */}
      <div className="min-h-[620px] grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
        {/* Left: Directory Tree & File Explorer */}
        <aside className="border-b md:border-b-0 md:border-r border-border flex flex-col bg-panel-alt min-h-[420px] md:min-h-[580px]">
          <div className="p-3 border-b border-border space-y-2.5 bg-panel">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Folder size={14} className="text-accent" />
                <span>Explorer</span>
              </span>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {filteredFiles.length} files
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter files or text..."
                className="w-full h-8 bg-panel-alt text-xs text-ink placeholder:text-faint pl-8 pr-7 rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-ink cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Language Filter Segment */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[11px]">
              {(["all", "typescript", "json", "css"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(lang)}
                  className={`px-2 py-1 rounded-md font-medium uppercase transition-colors cursor-pointer ${
                    languageFilter === lang
                      ? "bg-ink text-on-ink"
                      : "text-muted hover:text-ink hover:bg-panel-alt"
                  }`}
                >
                  {lang === "typescript" ? "TS/TSX" : lang}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Tree */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 font-mono text-xs">
            {Object.entries(foldersMap).map(([folder, filesInFolder]) => {
              const visibleFiles = filesInFolder.filter((f) =>
                filteredFiles.some((ff) => ff.path === f.path)
              );
              if (visibleFiles.length === 0) return null;

              const isCollapsed = !!collapsedFolders[folder];

              return (
                <div key={folder} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-left rounded-md text-muted hover:text-ink hover:bg-panel transition-colors font-medium cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {isCollapsed ? (
                        <Folder size={13} className="text-muted shrink-0" />
                      ) : (
                        <FolderOpen size={13} className="text-accent shrink-0" />
                      )}
                      <span className="truncate">{folder}/</span>
                    </span>
                    <span className="text-[11px] text-faint tabular-nums">
                      {visibleFiles.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="pl-3 space-y-0.5 border-l border-border ml-2.5">
                      {visibleFiles.map((file) => {
                        const isActive = file.path === selectedPath;
                        return (
                          <div
                            key={file.path}
                            className={`group w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                              isActive
                                ? "bg-accent-soft text-accent font-medium"
                                : "text-muted hover:text-ink hover:bg-panel"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedPath(file.path)}
                              className="flex items-center gap-1.5 truncate text-left flex-1 min-w-0 cursor-pointer"
                            >
                              <FileCode2
                                size={13}
                                className={isActive ? "text-accent shrink-0" : "text-faint shrink-0"}
                              />
                              <span className="truncate">{file.name}</span>
                              {file.isDirty && (
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-warn shrink-0"
                                  title="Unsaved changes"
                                />
                              )}
                            </button>

                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className="text-[10px] text-faint tabular-nums group-hover:hidden">
                                {file.size}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(file);
                                }}
                                className="hidden group-hover:inline-flex p-1 rounded hover:bg-base text-muted hover:text-ink cursor-pointer"
                                title="Download file"
                                aria-label={`Download ${file.name}`}
                              >
                                <Download size={12} />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFileToDelete(file);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="hidden group-hover:inline-flex p-1 rounded hover:bg-error/10 hover:text-error text-muted cursor-pointer"
                                title="Delete file"
                                aria-label={`Delete ${file.name}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Explorer Actions */}
          <div className="p-3 border-t border-border bg-panel space-y-2">
            <button
              type="button"
              onClick={() => setNewFileModalOpen(true)}
              className="w-full h-8 flex items-center justify-center gap-1.5 px-3 text-xs font-medium rounded-lg border border-border bg-panel-alt text-ink hover:bg-base transition-colors cursor-pointer"
            >
              <FilePlus size={13} className="text-accent" />
              <span>Create New File</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-border hover:border-accent rounded-lg py-2 px-2 text-center text-[11px] text-muted hover:text-ink cursor-pointer bg-base/40 transition-colors"
            >
              Drag &amp; drop files or click to upload
            </button>
          </div>
        </aside>

        {/* Right: Monaco Editor Stage */}
        <main className="flex flex-col min-h-0 bg-panel">
          {/* Breadcrumb & Editor Actions Toolbar */}
          <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-border bg-panel-alt gap-2">
            <div className="flex items-center gap-2.5 text-xs font-mono min-w-0">
              <span className="text-muted truncate">{activeFile.folder} /</span>
              <span className="font-semibold text-ink truncate">{activeFile.name}</span>

              <span className="text-[11px] text-muted uppercase">{activeFile.language}</span>

              <span className="text-[11px] text-faint hidden sm:inline tabular-nums">
                {activeFile.lines} lines · {activeFile.size}
              </span>

              {isDirty && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warn">
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                  Unsaved
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                title="Copy code to clipboard"
              >
                {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} className="text-muted" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadFile(activeFile)}
                className="h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                title="Download this file"
              >
                <Download size={13} className="text-muted" />
                <span>Download</span>
              </button>

              <button
                type="button"
                disabled={!isDirty}
                onClick={handleSave}
                className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors disabled:opacity-45 cursor-pointer"
              >
                <Save size={13} />
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* Monaco Code Editor Canvas */}
          <div className="flex-1 min-h-[480px] relative bg-panel-alt">
            <Editor
              height="100%"
              language={activeFile.language}
              value={currentContent}
              onChange={(value) => {
                setCurrentContent(value || "");
                setIsDirty(true);
              }}
              theme="vs-dark"
              options={{
                readOnly: false,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 16, bottom: 16 },
                smoothScrolling: true,
                cursorBlinking: "smooth",
                tabSize: 2,
              }}
            />
          </div>

          {/* Status Bar */}
          <footer className="px-4 py-2 border-t border-border bg-panel-alt text-[11px] font-mono text-muted flex flex-wrap items-center justify-between gap-2 tabular-nums">
            <div className="flex items-center gap-4">
              <span>Lines: {currentContent.split("\n").length}</span>
              <span>Characters: {currentContent.length}</span>
              <span>UTF-8</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Spaces: 2</span>
              <span className="capitalize">{activeFile.language}</span>
              <span className="inline-flex items-center gap-1 text-ok font-medium">
                <ShieldCheck size={12} />
                AST Valid
              </span>
            </div>
          </footer>
        </main>
      </div>

      {/* 5. Create File Modal */}
      <AnimatePresence>
        {newFileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Create Virtual File"
              className="w-full max-w-md rounded-xl border border-border bg-panel shadow-apple-lg overflow-hidden flex flex-col"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-panel-alt">
                <div className="flex items-center gap-2 font-display font-semibold text-sm text-ink">
                  <FilePlus size={16} className="text-accent" />
                  <span>Create Virtual File</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewFileModalOpen(false)}
                  aria-label="Close modal"
                  className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="file-path-input" className="text-xs font-medium text-ink block">
                    File Path
                  </label>
                  <input
                    id="file-path-input"
                    type="text"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    placeholder="e.g. src/components/Dashboard.tsx"
                    className="w-full h-9 bg-panel-alt text-xs font-mono text-ink px-3 rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                  <p className="text-[11px] text-muted">
                    Supports .tsx, .ts, .json, .css, .html, .py, and .sql
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="file-template-select"
                    className="text-xs font-medium text-ink block"
                  >
                    Boilerplate Template
                  </label>
                  <select
                    id="file-template-select"
                    value={newFileTemplate}
                    onChange={(e) => setNewFileTemplate(e.target.value as any)}
                    className="w-full h-9 bg-panel-alt text-xs text-ink px-3 rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
                  >
                    <option value="component">React Functional Component (.tsx)</option>
                    <option value="service">TypeScript Service Class (.ts)</option>
                    <option value="json">JSON Configuration (.json)</option>
                    <option value="blank">Blank File</option>
                  </select>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-border bg-panel-alt flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewFileModalOpen(false)}
                  className="h-8 px-3.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newFilePath.trim()}
                  onClick={handleCreateFile}
                  className="h-8 inline-flex items-center gap-1.5 px-4 text-xs font-medium rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors disabled:opacity-45 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Create File</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Delete File Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmOpen && fileToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm File Deletion"
              className="w-full max-w-sm rounded-xl border border-border bg-panel shadow-apple-lg overflow-hidden flex flex-col"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="px-5 py-4 border-b border-border bg-panel-alt flex items-center justify-between">
                <span className="font-display font-semibold text-sm text-ink">
                  Confirm File Deletion
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  aria-label="Close modal"
                  className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink flex items-center justify-center cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 space-y-2">
                <p className="text-sm text-ink">
                  Delete <strong className="font-mono text-error">{fileToDelete.path}</strong>?
                </p>
                <p className="text-xs text-muted">
                  This file will be permanently removed from the virtual codebase memory.
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-border bg-panel-alt flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="h-8 px-3.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteFile}
                  className="h-8 px-4 text-xs font-medium rounded-pill bg-error text-on-ink hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Delete File
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
