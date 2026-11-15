import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, FileText, Settings, CreditCard, Store, LayoutGrid, Home, Rocket, ShieldCheck, Shield, User, LogOut, ArrowRight, Workflow, Terminal, Lock } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import BrandLogo from "./BrandLogo";
import { useAuthStore } from "../store/authStore";
import { useActiveProject } from "../hooks/useActiveProject";

type Command = {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  section: "nav" | "action";
  keywords?: string[];
};

const COMMANDS: Command[] = [
  { id: "launch", label: "Launch CLI ($ build)", icon: <Rocket size={16} />, href: "/launch", section: "nav", keywords: ["launch", "prompt", "cli", "compiler"] },
  { id: "home", label: "Home (Landing Page)", icon: <Home size={16} />, href: "/home", section: "nav", keywords: ["home", "landing", "marketing", "overview"] },
  { id: "workspace", label: "Workspace IDE", icon: <Terminal size={16} />, href: "/projects", section: "nav", keywords: ["editor", "code", "dev", "workspace"] },
  { id: "projects", label: "Projects", icon: <LayoutGrid size={16} />, href: "/projects", section: "nav", keywords: ["dashboard", "library"] },
  { id: "initiatives", label: "Initiatives", icon: <Rocket size={16} />, href: "/initiatives", section: "nav", keywords: ["pm", "agile", "epics"] },
  { id: "flow", label: "Flow", icon: <Workflow size={16} />, href: "/flow", section: "nav", keywords: ["agents", "pipeline", "graph", "nodes"] },
  { id: "reviews", label: "Reviews", icon: <ShieldCheck size={16} />, href: "/reviews", section: "nav", keywords: ["orchestrator", "qa"] },
  { id: "marketplace", label: "Marketplace", icon: <Store size={16} />, href: "/marketplace", section: "nav", keywords: ["templates", "playbooks"] },
  { id: "billing", label: "Billing", icon: <CreditCard size={16} />, href: "/billing", section: "nav", keywords: ["plans", "subscription", "upgrade"] },
  { id: "settings", label: "Settings", icon: <Settings size={16} />, href: "/settings", section: "nav", keywords: ["preferences", "profile"] },
  { id: "admin", label: "Admin Ops Console", icon: <Shield size={16} />, href: "/admin", section: "nav", keywords: ["admin", "ops", "llm", "prompt", "health", "optimization"] },
  { id: "login", label: "Sign in / Auth", icon: <Lock size={16} />, href: "/login", section: "nav", keywords: ["login", "auth", "signin", "credentials"] },
  { id: "signup", label: "Create Account / Sign up", icon: <User size={16} />, href: "/signup", section: "nav", keywords: ["register", "signup", "join"] },
  { id: "new-build", label: "New build…", icon: <FileText size={16} />, href: "/projects", section: "action", keywords: ["create", "prompt", "start"] },
  { id: "profile", label: "Profile & account", icon: <User size={16} />, href: "/settings", section: "action", keywords: ["account", "avatar", "name"] },
  { id: "logout", label: "Log out", icon: <LogOut size={16} />, href: "/login", section: "action", keywords: ["sign out"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    const scoped = (sub: string) => projectPath(sub);
    if (cmd.id === "workspace") {
      navigate(scoped("workspace"));
      setOpen(false);
      return;
    }
    if (cmd.id === "initiatives") {
      navigate(scoped("initiatives"));
      setOpen(false);
      return;
    }
    if (cmd.id === "flow") {
      navigate(scoped("flow"));
      setOpen(false);
      return;
    }
    if (cmd.id === "reviews") {
      navigate(scoped("reviews"));
      setOpen(false);
      return;
    }
    if (cmd.id === "settings") {
      navigate(scoped("settings"));
      setOpen(false);
      return;
    }
    if (cmd.id === "new-build") {
      navigate(cmd.href);
      setOpen(false);
      return;
    }
    navigate(cmd.href);
    setOpen(false);
  };

  const sections = [
    { key: "nav", label: "Navigation" },
    { key: "action", label: "Actions" },
  ] as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-lg rounded-sm bg-white border-3 border-black shadow-brutal-xl overflow-hidden"
             initial={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             exit={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2.5 px-4 border-b-2 border-black bg-brutal-cream">
              <BrandLogo size="xs" />
              <Search size={16} className="text-black shrink-0" strokeWidth={2.5} aria-hidden="true" />
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
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent py-3.5 text-sm font-bold text-black placeholder:text-muted/60 focus:outline-none"
                aria-label="Search commands"
                aria-controls="command-list"
                aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded-sm border-2 border-black bg-white px-1.5 py-0.5 text-[10px] font-mono font-bold text-black shadow-brutal-sm">
                ESC
              </kbd>
            </div>
            <div
              id="command-list"
              ref={listRef}
              role="listbox"
              className="max-h-80 overflow-y-auto p-2.5 bg-white"
              aria-label="Commands"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm font-bold text-muted">No results for &ldquo;{query}&rdquo;</p>
              ) : (
                sections.map((section) => {
                  const items = filtered.filter((c) => c.section === section.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={section.key} className="mb-2 last:mb-0">
                      <p className="px-3 pt-2 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-black">{section.label}</p>
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
                            className={[
                              "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm font-bold transition-all border-2",
                              isActive ? "bg-brutal-yellow text-black border-black shadow-brutal-sm translate-x-1" : "text-black border-transparent hover:bg-neutral-100",
                            ].join(" ")}
                          >
                            <span className="shrink-0 text-black">{cmd.icon}</span>
                            <span className="flex-1 truncate">{cmd.label}</span>
                            {cmd.id === "new-build" && <ArrowRight size={14} className="shrink-0 text-black" strokeWidth={2.5} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t-2 border-black bg-brutal-cream px-4 py-2 text-[11px] font-bold text-black">
              <span className="flex items-center gap-2">
                <BrandLogo size="xs" />
                <span><kbd className="font-mono bg-white px-1 border border-black rounded-none">↑↓</kbd> to navigate · <kbd className="font-mono bg-white px-1 border border-black rounded-none">↵</kbd> to select</span>
              </span>
              <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
