import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, CornerDownLeft, X, Layers, Cpu, ShieldCheck, Database, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ForgeCommandTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  initialQuery?: string;
}

const SUGGESTIONS = [
  {
    icon: ShieldCheck,
    title: "Add OAuth login with Google",
    context: "auth · sessions · token-refresh · user-model",
    prompt: "Add OAuth login with Google and GitHub session handling",
  },
  {
    icon: CreditCard,
    title: "Build SaaS landing page with Stripe checkout",
    context: "billing · webhooks · stripe-elements · tiers",
    prompt: "Build a SaaS landing page with Stripe checkout and subscription tiers",
  },
  {
    icon: Database,
    title: "Design PostgreSQL schema for multi-tenant analytics",
    context: "database · migrations · indexing · foreign-keys",
    prompt: "Design PostgreSQL schema for multi-tenant customer analytics platform",
  },
  {
    icon: Cpu,
    title: "Run automated QA test suite & benchmark",
    context: "qa · 42 tests · latency · edge-runtime",
    prompt: "Run full QA test suite, verify 42 test assertions, and report latency",
  },
  {
    icon: Layers,
    title: "Deploy to production edge cluster",
    context: "infra · cloudflare · ssl · zero-downtime",
    prompt: "Deploy current build to edge network with automated SSL and health probes",
  },
];

export function ForgeCommandTerminal({
  isOpen,
  onClose,
  onSubmit,
  initialQuery = "",
}: ForgeCommandTerminalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % SUGGESTIONS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + SUGGESTIONS.length) % SUGGESTIONS.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const promptToRun = query.trim() || SUGGESTIONS[selectedIndex].prompt;
      if (promptToRun) {
        onSubmit(promptToRun);
        onClose();
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] px-4">
          {/* Cinematic Dimming Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#060709]/85 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Command Terminal Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-2xl rounded-2xl bg-[#0F1117] border border-white/[0.12] shadow-2xl shadow-black/80 overflow-hidden select-none"
            role="dialog"
            aria-modal="true"
            aria-label="Forge Command Surface"
          >
            {/* Top Bar with Micro Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/[0.06] text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#FF5722] text-sm">◈</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#F4F4F6] font-semibold">
                  Forge Intelligence Command
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#888B96] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                  ESC to cancel
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[#888B96] hover:text-[#F4F4F6] p-1 rounded transition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Prompt Prompt Section */}
            <div className="px-6 py-6">
              <label htmlFor="forge-cmd-input" className="block text-[15px] font-medium text-[#F4F4F6] tracking-tight mb-3">
                What are we building?
              </label>

              <div className="relative flex items-center rounded-xl bg-[#090A0E] border border-white/[0.1] focus-within:border-[#FF5722] focus-within:ring-1 focus-within:ring-[#FF5722]/40 transition shadow-inner">
                <span className="pl-4 text-[#FF5722] font-mono text-base select-none">&gt;</span>
                <input
                  id="forge-cmd-input"
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add OAuth login with Google, Stripe billing, customer analytics..."
                  className="w-full bg-transparent px-3 py-3.5 text-sm text-[#F4F4F6] placeholder-[#5A5D68] focus:outline-none font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => {
                    const p = query.trim() || SUGGESTIONS[selectedIndex].prompt;
                    if (p) {
                      onSubmit(p);
                      onClose();
                    }
                  }}
                  className="mr-2 px-3 py-1.5 rounded-lg bg-[#FF5722] text-white text-xs font-semibold hover:bg-[#FF7A1A] active:scale-95 transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>Forge</span>
                  <CornerDownLeft size={12} />
                </button>
              </div>

              {/* Forge Understanding Banner */}
              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
                <span className="text-[#888B96]">Forge understands:</span>
                <span className="text-[#A0A3AF] tracking-wide">
                  auth · database · existing API · tests · edge deploy
                </span>
              </div>
            </div>

            {/* Quick Intent Suggestions */}
            <div className="bg-[#090A0E]/60 px-4 py-3 border-t border-white/[0.06]">
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#5A5D68] px-2 mb-2">
                Quick Intelligence Patterns
              </p>
              <div className="space-y-1">
                {SUGGESTIONS.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        onSubmit(item.prompt);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition ${
                        isSelected
                          ? "bg-white/[0.07] text-[#F4F4F6] border border-white/[0.08]"
                          : "text-[#888B96] hover:text-[#F4F4F6] hover:bg-white/[0.03] border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon
                          size={14}
                          className={isSelected ? "text-[#FF5722]" : "text-[#5A5D68]"}
                        />
                        <span className="text-xs font-medium truncate">{item.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#5A5D68] hidden sm:inline truncate ml-4">
                        {item.context}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-[#0A0B0E] border-t border-white/[0.06] text-[11px] font-mono text-[#5A5D68]">
              <span>Use <kbd className="text-[#888B96] bg-white/[0.06] px-1 py-0.5 rounded">↑</kbd> <kbd className="text-[#888B96] bg-white/[0.06] px-1 py-0.5 rounded">↓</kbd> to navigate</span>
              <span><kbd className="text-[#888B96] bg-white/[0.06] px-1 py-0.5 rounded">↵</kbd> to build</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
