import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  FileText,
  Settings,
  CreditCard,
  Store,
  LayoutGrid,
  Home,
  Rocket,
  ShieldCheck,
  User,
  LogOut,
  ArrowRight,
  Workflow,
  Terminal,
  Lock,
  Box,
  LayoutDashboard,
  Users,
  Sparkles,
  Network,
  Brain,
  Shield,
  Layers,
  Bot,
  GitCompare,
  FolderTree,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import BrandLogo from "./BrandLogo";
import { useAuthStore } from "../store/authStore";
import { useActiveProject } from "../hooks/useActiveProject";
import { OPEN_COMMAND_PALETTE_EVENT } from "../lib/commandPalette";

type Command = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Absolute path, or a sub-path of the current project when `projectSub` is set. */
  href: string;
  projectSub?: boolean;
  section: "nav" | "project" | "action";
  keywords?: string[];
};

const COMMANDS: Command[] = [
  { id: "command-center", label: "Command Center", icon: <LayoutDashboard size={15} />, href: "/command", section: "nav", keywords: ["home", "dashboard", "overview", "fleet", "runs"] },
  { id: "projects", label: "Projects", icon: <LayoutGrid size={15} />, href: "/projects", section: "nav", keywords: ["dashboard", "library", "repos"] },
  { id: "launch", label: "New Build", icon: <Rocket size={15} />, href: "/launch", section: "nav", keywords: ["launch", "launchpad", "prompt", "cli", "create"] },
  { id: "approvals", label: "Approvals", icon: <ShieldCheck size={15} />, href: "/approvals", section: "nav", keywords: ["gates", "review", "pending", "approve"] },
  { id: "agents", label: "Agents (engineering org)", icon: <Users size={15} />, href: "/agents", section: "nav", keywords: ["org", "fleet", "roles"] },
  { id: "skills", label: "Skills", icon: <Sparkles size={15} />, href: "/skills", section: "nav", keywords: ["capabilities", "tools"] },
  { id: "protocols", label: "Protocols", icon: <Network size={15} />, href: "/protocols", section: "nav", keywords: ["mcp", "a2a", "a2ui", "agui"] },
  { id: "models", label: "Models", icon: <Brain size={15} />, href: "/models", section: "nav", keywords: ["llm", "providers", "gateway", "model studio"] },
  { id: "studio-3d", label: "3D Spatial Studio", icon: <Box size={15} />, href: "/studio-3d", section: "nav", keywords: ["3d", "threejs", "spatial", "topology"] },
  { id: "marketplace", label: "Marketplace", icon: <Store size={15} />, href: "/marketplace", section: "nav", keywords: ["templates", "playbooks", "plugins"] },
  { id: "billing", label: "Billing", icon: <CreditCard size={15} />, href: "/billing", section: "nav", keywords: ["plans", "subscription", "upgrade", "credits"] },
  { id: "settings", label: "Settings", icon: <Settings size={15} />, href: "/settings", section: "nav", keywords: ["preferences", "profile", "account"] },
  { id: "admin", label: "Admin Ops", icon: <Shield size={15} />, href: "/admin", section: "nav", keywords: ["admin", "governance", "system", "users", "console"] },
  { id: "optimization-dashboard", label: "Optimization Dashboard (Admin)", icon: <Workflow size={15} />, href: "/optimization-dashboard", section: "nav", keywords: ["admin", "optimizer", "tokens", "cost"] },
  { id: "engineering-health", label: "Engineering Health (Admin)", icon: <ShieldCheck size={15} />, href: "/engineering-health", section: "nav", keywords: ["admin", "health", "metrics", "fleet"] },
  { id: "prompt-studio", label: "Prompt Studio (Admin)", icon: <Terminal size={15} />, href: "/prompt-studio", section: "nav", keywords: ["admin", "prompts", "templates"] },
  { id: "home", label: "Forge home (landing page)", icon: <Home size={15} />, href: "/home", section: "nav", keywords: ["home", "landing", "marketing"] },
  { id: "workspace", label: "Build (workspace IDE)", icon: <Terminal size={15} />, href: "workspace", projectSub: true, section: "project", keywords: ["editor", "code", "dev", "workspace", "ide"] },
  { id: "initiatives", label: "Plan (initiatives)", icon: <Layers size={15} />, href: "initiatives", projectSub: true, section: "project", keywords: ["pm", "agile", "epics", "kanban", "roadmap"] },
  { id: "flow", label: "Project agents", icon: <Bot size={15} />, href: "agents", projectSub: true, section: "project", keywords: ["agents", "pipeline", "graph", "flow", "runs"] },
  { id: "reviews", label: "Reviews", icon: <GitCompare size={15} />, href: "reviews", projectSub: true, section: "project", keywords: ["orchestrator", "qa", "diff", "pr"] },
  { id: "files", label: "Files", icon: <FolderTree size={15} />, href: "files", projectSub: true, section: "project", keywords: ["tree", "repo", "assets"] },
  { id: "history", label: "History", icon: <Clock size={15} />, href: "history", projectSub: true, section: "project", keywords: ["audit", "log", "revisions"] },
  { id: "project-settings", label: "Project settings", icon: <SlidersHorizontal size={15} />, href: "settings", projectSub: true, section: "project", keywords: ["integrations", "config"] },
  { id: "new-build", label: "Describe a new build…", icon: <FileText size={15} />, href: "/launch", section: "action", keywords: ["create", "prompt", "start", "new project"] },
  { id: "profile", label: "Profile & account", icon: <User size={15} />, href: "/settings", section: "action", keywords: ["account", "avatar", "name"] },
  { id: "login", label: "Sign in", icon: <Lock size={15} />, href: "/login", section: "action", keywords: ["login", "auth", "signin"] },
  { id: "signup", label: "Create account", icon: <User size={15} />, href: "/signup", section: "action", keywords: ["register", "signup", "join"] },
  { id: "logout", label: "Sign out", icon: <LogOut size={15} />, href: "/login", section: "action", keywords: ["sign out", "logout"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const { projectPath } = useActiveProject();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setQuery("");
            setActiveIndex(0);
          }
          return !v;
        });
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => {
      setQuery("");
      setActiveIndex(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const filtered = query.trim()
    ? COMMANDS.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.label.toLowerCase().includes(q) ||
          c.section.includes(q) ||
          c.keywords?.some((k) => k.includes(q))
        );
      })
    : COMMANDS;

  const handleSelect = (cmd: Command) => {
    if (cmd.id === "logout") {
      logout();
      navigate("/login", { replace: true });
      return;
    }
    if (cmd.projectSub) {
      navigate(projectPath(cmd.href));
      setOpen(false);
      return;
    }
    navigate(cmd.href);
    setOpen(false);
  };

  const sections = [
    { key: "nav", label: "Navigation" },
    { key: "project", label: "Current project" },
    { key: "action", label: "Actions" },
  ] as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-base/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-panel shadow-apple-float"
            initial={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2.5 border-b border-border bg-panel px-4">
              <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && filtered[activeIndex]) {
                    handleSelect(filtered[activeIndex]);
                  }
                }}
                placeholder="Jump to page, tool, or action…"
                className="flex-1 bg-transparent py-3.5 text-sm text-ink placeholder:text-faint focus:outline-none"
                aria-label="Search commands"
                aria-controls="command-list"
                aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
              />
              <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-panel-alt px-1.5 py-0.5 font-mono text-[10px] text-muted">
                ESC
              </kbd>
            </div>

            <div
              id="command-list"
              ref={listRef}
              role="listbox"
              className="max-h-80 overflow-y-auto p-2"
              aria-label="Commands"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted">
                  No results for &ldquo;{query}&rdquo;
                </p>
              ) : (
                sections.map((section) => {
                  const items = filtered.filter((c) => c.section === section.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={section.key} className="mb-2 last:mb-0">
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted">
                        {section.label}
                      </p>
                      {items.map((cmd) => {
                        const globalIdx = filtered.indexOf(cmd);
                        const isActive = globalIdx === activeIndex;
                        return (
                          <button
                            key={cmd.id}
                            id={`cmd-${cmd.id}`}
                            role="option"
                            aria-selected={isActive}
                            onClick={() => handleSelect(cmd)}
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-ink/[0.06] text-ink font-medium"
                                : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                            }`}
                          >
                            <span className={isActive ? "text-ink" : "text-faint"}>
                              {cmd.icon}
                            </span>
                            <span className="flex-1 truncate">{cmd.label}</span>
                            {cmd.id === "new-build" && (
                              <ArrowRight size={14} className="shrink-0 opacity-70" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border bg-panel-alt/60 px-4 py-2 text-[11px] text-muted">
              <span className="flex items-center gap-2">
                <BrandLogo size="xs" />
                <span>
                  <kbd className="font-mono">↑↓</kbd> navigate · <kbd className="font-mono">↵</kbd> open
                </span>
              </span>
              <span className="font-mono tabular-nums">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
