import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
    <div className="min-h-screen bg-white text-black p-8 font-sans">
      <header className="flex items-center justify-between pb-6 border-b-2 border-black">
        <h1 className="font-mono text-2xl font-bold tracking-tight">Forge Workspace</h1>
        <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-sm bg-brutal-green text-black border-2 border-black shadow-brutal-xs">
          Agent Fleet Active
        </span>
      </header>
      <main className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {pipeline.map((agent) => (
          <div key={agent} className="p-5 rounded-sm bg-white border-2 border-black shadow-brutal-sm">
            <h3 className="font-mono font-bold text-sm text-ink">{agent}</h3>
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
    const list: VirtualFile[] = [...DEFAULT_FILES];
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

  const [selectedPath, setSelectedPath] = useState<string>(DEFAULT_FILES[0].path);
  const [currentContent, setCurrentContent] = useState<string>(DEFAULT_FILES[0].content);
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
      initialCode = `import React from 'react';\n\nexport default function ${compName}() {\n  return (\n    <div className="p-4 rounded-sm border-2 border-black bg-white">\n      <h2 className="font-mono text-lg font-bold">${compName}</h2>\n    </div>\n  );\n}\n`;
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

  return (
    <motion.div
      className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 1. Header Section */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black dark:border-white/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandLogo size="md" />
              <h1 className="font-mono text-2xl sm:text-3xl font-black uppercase tracking-wider text-ink">
                codebase &amp; virtual files
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-none border-2 border-black bg-brutal-yellow text-black text-[11px] font-black uppercase shadow-[2px_2px_0px_#000]">
                <GitBranch size={12} className="text-black" strokeWidth={2.5} />
                branch: main
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm font-mono text-muted">
              Inspect, modify, and create workspace files with live syntax validation and AST tree indexing.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-xs font-mono font-bold text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
            >
              <Upload size={13} className="text-ink" strokeWidth={2.5} />
              <span>Upload</span>
            </button>

            <button
              type="button"
              onClick={handleExportAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-xs font-mono font-bold text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
            >
              <Download size={13} className="text-ink" strokeWidth={2.5} />
              <span>Export All</span>
            </button>

            <button
              type="button"
              onClick={() => setNewFileModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-none border-2 border-black bg-brutal-yellow text-black text-xs font-mono font-black uppercase hover:bg-[#2DD4BF] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all shadow-[2px_2px_0px_#000]"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>New File</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-2 border-black bg-black dark:bg-white text-white dark:text-black text-xs font-mono font-black uppercase hover:bg-neutral-800 dark:hover:bg-neutral-200 transition shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
            >
              <span>Workspace</span>
              <ExternalLink size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* 2. Telemetry KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Files */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <FileCode2 size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Virtual Files
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-none bg-brutal-cyan text-black font-black uppercase border border-black">
                Active
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              {virtualFiles.length}{" "}
              <span className="text-xs font-bold text-muted uppercase">files</span>
            </p>
            <p className="text-[10px] font-mono text-muted">
              Synchronized with memory store
            </p>
          </div>

          {/* Lines of Code */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <Code2 size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Code Volume
              </span>
              <span className="text-[10px] font-mono font-black uppercase text-emerald-600 dark:text-emerald-400">
                Live
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              {totalLOC.toLocaleString()}{" "}
              <span className="text-xs font-bold text-muted uppercase">LOC</span>
            </p>
            <p className="text-[10px] font-mono text-muted">
              Across all virtual modules
            </p>
          </div>

          {/* Size in KB */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <Layers size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Bundle Footprint
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-none bg-brutal-green text-black font-black uppercase border border-black">
                Clean
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              {totalSizeFormatted}{" "}
              <span className="text-xs font-bold text-muted uppercase">KB</span>
            </p>
            <p className="text-[10px] font-mono text-muted">
              Zero dependency bloat
            </p>
          </div>

          {/* Language Stack */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Language Engine
              </span>
              <span className="text-[10px] font-mono font-black uppercase px-1.5 py-0.2 rounded-none border border-black bg-brutal-yellow text-black">
                TS 5.4
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink truncate">
              TypeScript
            </p>
            <p className="text-[10px] font-mono text-muted">
              Monaco LS syntax checking
            </p>
          </div>
        </div>
      </header>

      {/* 3. Drag and Drop Overlay Warning if dragging */}
      {isDraggingOver && (
        <div className="p-4 rounded-none border-2 border-dashed border-black bg-brutal-yellow text-center font-mono font-black text-sm uppercase shadow-[3px_3px_0px_#000] text-black">
          Drop code files here to import directly into the virtual filesystem
        </div>
      )}

      {/* 4. Main IDE-Grade Stage */}
      <div className="min-h-[620px] grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff] overflow-hidden">
        {/* Left: Directory Tree & File List */}
        <aside className="border-r-2 border-black dark:border-white/80 flex flex-col bg-neutral-50 dark:bg-[#141419] min-h-[580px]">
          {/* Tree Header & Search */}
          <div className="p-3 border-b-2 border-black dark:border-white/80 space-y-2.5 bg-white dark:bg-[#181820]">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="flex items-center gap-1.5 text-ink font-black tracking-wider uppercase">
                <Folder size={14} className="text-black dark:text-white" strokeWidth={2.5} />
                <span>EXPLORER</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-none bg-neutral-100 dark:bg-neutral-800 border border-black dark:border-white/40 text-ink font-bold">
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
                className="w-full bg-white dark:bg-[#141419] text-xs font-mono font-bold text-ink placeholder-muted/60 pl-8 pr-7 py-1.5 rounded-none border-2 border-black dark:border-white/80 focus:outline-none focus:bg-brutal-yellow/10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-black dark:hover:text-white"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {/* Language filter pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono font-bold">
              {(["all", "typescript", "json", "css"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(lang)}
                  className={`px-2 py-0.5 rounded-none border-2 transition uppercase font-black ${
                    languageFilter === lang
                      ? "bg-brutal-yellow text-black border-black shadow-[1px_1px_0px_#000]"
                      : "bg-white dark:bg-[#141419] text-muted border-black/40 dark:border-white/40 hover:border-black dark:hover:border-white hover:text-ink"
                  }`}
                >
                  {lang === "typescript" ? "TS/TSX" : lang}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Tree Hierarchy */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3 font-mono text-xs">
            {Object.entries(foldersMap).map(([folder, filesInFolder]) => {
              const visibleFiles = filesInFolder.filter((f) =>
                filteredFiles.some((ff) => ff.path === f.path)
              );
              if (visibleFiles.length === 0) return null;

              const isCollapsed = !!collapsedFolders[folder];

              return (
                <div key={folder} className="space-y-1">
                  {/* Folder Row */}
                  <button
                    type="button"
                    onClick={() => toggleFolder(folder)}
                    className="w-full flex items-center justify-between px-2 py-1 text-left rounded-none text-muted hover:text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition font-bold"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {isCollapsed ? (
                        <Folder size={13} className="text-black dark:text-white" strokeWidth={2} />
                      ) : (
                        <FolderOpen size={13} className="text-black dark:text-white" strokeWidth={2} />
                      )}
                      <span className="truncate">{folder}/</span>
                    </span>
                    <span className="text-[10px] text-muted">
                      {visibleFiles.length}
                    </span>
                  </button>

                  {/* Files inside folder */}
                  {!isCollapsed && (
                    <div className="pl-3 space-y-0.5 border-l-2 border-black/30 dark:border-white/30 ml-2">
                      {visibleFiles.map((file) => {
                        const isActive = file.path === selectedPath;
                        return (
                          <div
                            key={file.path}
                            className={`group w-full flex items-center justify-between px-2 py-1.5 rounded-none transition ${
                              isActive
                                ? "bg-brutal-yellow text-black border-2 border-black font-black shadow-[2px_2px_0px_#000]"
                                : "text-muted hover:text-ink hover:bg-white dark:hover:bg-[#181820]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedPath(file.path)}
                              className="flex items-center gap-1.5 truncate text-left flex-1 min-w-0"
                            >
                              <FileCode2 size={13} className={isActive ? "text-black shrink-0" : "text-muted shrink-0"} />
                              <span className="truncate">{file.name}</span>
                              {file.isDirty && (
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" title="Unsaved changes" />
                              )}
                            </button>

                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className="text-[10px] opacity-70 group-hover:hidden">
                                {file.size}
                              </span>

                              {/* Action buttons on hover */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(file);
                                }}
                                className="hidden group-hover:inline-flex p-1 rounded-none hover:bg-black/10 dark:hover:bg-white/10 text-ink"
                                title="Download file"
                              >
                                <Download size={11} strokeWidth={2.5} />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFileToDelete(file);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="hidden group-hover:inline-flex p-1 rounded-none hover:bg-rose-500 hover:text-white text-muted"
                                title="Delete file"
                              >
                                <Trash2 size={11} strokeWidth={2.5} />
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

          {/* Bottom Dropzone & New File trigger */}
          <div className="p-2.5 border-t-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] space-y-2">
            <button
              type="button"
              onClick={() => setNewFileModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-mono font-black uppercase rounded-none border-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-neutral-800 text-ink hover:bg-neutral-200 dark:hover:bg-neutral-700 transition shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff]"
            >
              <FilePlus size={13} strokeWidth={2.5} />
              <span>Create New File</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-black/40 dark:border-white/40 hover:border-black dark:hover:border-white rounded-none p-2 text-center text-[10px] font-mono text-muted hover:text-ink cursor-pointer bg-neutral-50 dark:bg-[#141419] transition"
            >
              Drag &amp; drop files or click to upload
            </button>
          </div>
        </aside>

        {/* Right: Monaco Editor Stage */}
        <main className="flex flex-col min-h-0 bg-white dark:bg-[#181820]">
          {/* Breadcrumb & Editor Actions Toolbar */}
          <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-[#141419] gap-2">
            {/* File Path info */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-muted">{activeFile.folder} /</span>
              <span className="font-bold text-ink">{activeFile.name}</span>

              <span className="text-[10px] px-2 py-0.5 rounded-none bg-white dark:bg-[#181820] border-2 border-black dark:border-white/80 font-black uppercase text-ink shadow-[1px_1px_0px_#000]">
                {activeFile.language}
              </span>

              <span className="text-[11px] text-muted hidden sm:inline">
                {activeFile.lines} lines • {activeFile.size}
              </span>

              {isDirty && (
                <span className="text-[10px] font-mono font-black uppercase px-1.5 py-0.5 rounded-none bg-rose-500 text-white border border-black animate-pulse">
                  ● Unsaved
                </span>
              )}
            </div>

            {/* Editor Action Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff]"
                title="Copy code to clipboard"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadFile(activeFile)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff]"
                title="Download this file"
              >
                <Download size={12} strokeWidth={2.5} />
                <span>Download</span>
              </button>

              <button
                type="button"
                disabled={!isDirty}
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-black uppercase rounded-none border-2 border-black bg-brutal-yellow text-black hover:bg-[#2DD4BF] transition shadow-[2px_2px_0px_#000] disabled:opacity-50 disabled:shadow-none"
              >
                <Save size={13} strokeWidth={2.5} />
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* Monaco Code Editor Canvas */}
          <div className="flex-1 min-h-[460px] relative">
            <Editor
              height="100%"
              language={activeFile.language}
              value={currentContent}
              onChange={(value) => {
                setCurrentContent(value || "");
                setIsDirty(true);
              }}
              theme="vs"
              options={{
                readOnly: false,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "var(--font-mono, monospace)",
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
          <footer className="px-4 py-1.5 border-t-2 border-black dark:border-white/80 bg-neutral-50 dark:bg-[#141419] text-[11px] font-mono text-muted flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Lines: {currentContent.split("\n").length}</span>
              <span>Characters: {currentContent.length}</span>
              <span>UTF-8</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Spaces: 2</span>
              <span>Language: {activeFile.language}</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <ShieldCheck size={11} strokeWidth={2.5} />
                AST Valid
              </span>
            </div>
          </footer>
        </main>
      </div>

      {/* 5. Create File Modal */}
      <AnimatePresence>
        {newFileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              className="w-full max-w-md rounded-none border-3 border-black dark:border-white bg-white dark:bg-[#181820] shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff] overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b-2 border-black bg-brutal-yellow">
                <div className="flex items-center gap-2 font-mono font-black uppercase text-sm text-black">
                  <FilePlus size={16} strokeWidth={2.5} />
                  <span>Create Virtual File</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewFileModalOpen(false)}
                  className="p-1 rounded-none border-2 border-black bg-white text-black hover:bg-neutral-100 shadow-[1px_1px_0px_#000]"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="file-path-input" className="font-mono text-xs font-black uppercase text-muted">
                    File Path (with directory)
                  </label>
                  <input
                    id="file-path-input"
                    type="text"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    placeholder="e.g. src/components/Dashboard.tsx"
                    className="w-full bg-white dark:bg-[#141419] text-xs font-mono font-bold text-ink p-2.5 rounded-none border-2 border-black dark:border-white/80 focus:outline-none focus:bg-brutal-yellow/10 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                  />
                  <p className="text-[10px] font-mono text-muted">
                    Supports .tsx, .ts, .json, .css, .html, .py, etc.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="file-template-select" className="font-mono text-xs font-black uppercase text-muted">
                    Boilerplate Template
                  </label>
                  <select
                    id="file-template-select"
                    value={newFileTemplate}
                    onChange={(e) => setNewFileTemplate(e.target.value as any)}
                    className="w-full bg-white dark:bg-[#141419] text-xs font-mono font-bold text-ink p-2.5 rounded-none border-2 border-black dark:border-white/80 focus:outline-none shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                  >
                    <option value="component">React Functional Component (.tsx)</option>
                    <option value="service">TypeScript Service Class (.ts)</option>
                    <option value="json">JSON Configuration (.json)</option>
                    <option value="blank">Blank File</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-[#141419] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewFileModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newFilePath.trim()}
                  onClick={handleCreateFile}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-black uppercase rounded-none border-2 border-black bg-brutal-yellow text-black hover:bg-[#2DD4BF] transition shadow-[2px_2px_0px_#000] disabled:opacity-50"
                >
                  <Plus size={13} strokeWidth={2.5} />
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              className="w-full max-w-sm rounded-none border-3 border-black dark:border-white bg-white dark:bg-[#181820] shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff] overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="p-4 border-b-2 border-black bg-rose-500 text-white font-mono font-black uppercase text-sm flex items-center justify-between">
                <span>Confirm File Deletion</span>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="p-1 rounded-none text-white hover:bg-black/20"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              <div className="p-5 space-y-2 font-mono">
                <p className="text-sm text-ink font-bold">
                  Are you sure you want to delete <strong className="text-rose-600 dark:text-rose-400">{fileToDelete.path}</strong>?
                </p>
                <p className="text-xs text-muted">
                  This file will be permanently removed from the virtual codebase memory.
                </p>
              </div>

              <div className="p-3 border-t-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-[#141419] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteFile}
                  className="px-4 py-1.5 text-xs font-mono font-black uppercase rounded-none border-2 border-black bg-rose-500 text-white hover:bg-rose-600 transition shadow-[2px_2px_0px_#000]"
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
