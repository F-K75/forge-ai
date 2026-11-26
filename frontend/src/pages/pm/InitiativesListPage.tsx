import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Rocket,
  Sparkles,
  Layers,
  Search,
  LayoutGrid,
  List,
  FolderSearch,
  Coins,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Tag,
  Kanban,
  Volume2,
  VolumeX,
  ChevronRight,
  Star,
  Bot,
  ShieldCheck,
  Code2,
  Palette,
  Check,
  ExternalLink,
} from "lucide-react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { captureEvent } from "../../lib/analytics";
import { formatRelativeTime } from "../../lib/format";
import { coverGradient } from "../../lib/coverArt";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
import { motion } from "../../lib/animations";
import {
  SAMPLE_INITIATIVES,
  getLocalInitiatives,
  createSimulatedInitiative,
} from "../../lib/pmData";
import { generateInitiativeWithGemini } from "../../lib/geminiPM";
import { RequirementsSurvey } from "../../components/pm/RequirementsSurvey";
import { VoiceInputButton } from "../../components/pm/VoiceInputButton";
import { SuiWindowFrame, BottomNavItem } from "../../components/pm/SuiWindowFrame";
import { SuiKeycapVisual } from "../../components/pm/SuiKeycapVisual";

/* ------------------------------------------------------------------ */
/* Subtle Audio Synthesizer                                           */
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

interface Initiative {
  id: string;
  name: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  status?: string;
  meta?: string[];
  techStack?: string[];
  timeline?: string;
}

interface CreditPreview {
  cost: number;
  free_available: boolean;
  credits_remaining: number;
}

type InitiativeStatusFilter = "all" | "active" | "complete" | "failed";
type SortKey = "recent" | "name" | "status";
type ViewMode = "icons" | "list";

const SUGGESTIONS = [
  "AI SaaS Platform",
  "CRM for Healthcare",
  "Marketplace",
  "Internal HR Tool",
  "Analytics Dashboard",
  "Developer Platform",
];

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

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function toDisplayInitiative(raw: any): Initiative {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.vision || raw.description || "Production-grade multi-agent architecture plan.",
    updated_at: raw.updated_at,
    created_at: raw.created_at,
    status: raw.status || "active",
    meta: [
      raw.estimated_timeline,
      raw.project_ids?.length ? `${raw.project_ids.length} apps` : null,
    ].filter(Boolean) as string[],
    techStack: raw.tech_stack || ["TypeScript", "React", "PostgreSQL"],
    timeline: raw.estimated_timeline || "4 sprints · 8 weeks",
  };
}

function getStatusBadge(status?: string) {
  const s = (status || "active").toLowerCase();
  if (s === "generating" || s === "planning") {
    return {
      label: "Planning",
      bg: "bg-info/10 text-info border-info/30",
      dot: "bg-panel-alt animate-ping",
    };
  }
  if (s === "completed" || s === "done") {
    return {
      label: "Completed",
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
  if (s === "draft") {
    return {
      label: "Draft",
      bg: "bg-panel-alt text-ink border-border",
      dot: "bg-ink/30",
    };
  }
  return {
    label: "Active",
    bg: "bg-ok/10 text-ok border-ok/30",
    dot: "bg-ok animate-pulse",
  };
}

/* ------------------------------------------------------------------ */
/* Pinterest-Style Specialist Agents Cluster                          */
/* ------------------------------------------------------------------ */

const SPECIALISTS = [
  {
    id: "sophia",
    name: "Sophia",
    role: "Chief AI Architect",
    color: "#10B981",
    tagBg: "bg-ok text-on-ink",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    icon: Bot,
    coords: { x: "28%", y: "18%" },
  },
  {
    id: "rakib",
    name: "Rakib",
    role: "Lead Systems Engineer",
    color: "#2563EB",
    tagBg: "bg-ink text-on-ink",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    icon: Code2,
    coords: { x: "74%", y: "12%" },
  },
  {
    id: "parves",
    name: "Parves",
    role: "Principal UX Designer",
    color: "#F59E0B",
    tagBg: "bg-accent text-on-ink",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    icon: Palette,
    coords: { x: "20%", y: "62%" },
  },
  {
    id: "shoaib",
    name: "Shoaib",
    role: "Reliability & QA Lead",
    color: "#9333EA",
    tagBg: "bg-ink text-on-ink",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
    icon: ShieldCheck,
    coords: { x: "68%", y: "66%" },
  },
];

/* ------------------------------------------------------------------ */
/* Library Cards and Rows                                             */
/* ------------------------------------------------------------------ */

function InitiativeCard({
  initiative,
  onOpen,
}: {
  initiative: Initiative;
  onOpen: () => void;
}) {
  const badge = getStatusBadge(initiative.status);

  return (
    <motion.div variants={itemVariants} className="flex flex-col h-full">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="group relative flex flex-col justify-between h-full cursor-pointer bg-panel border border-border hover:border-border rounded-2xl p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-border"
      >
        <div>
          {/* Header Row: Status & Timeline Badge */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>

            <span className="flex items-center gap-1.5 text-xs font-medium text-muted bg-panel-alt px-3 py-1 rounded-full">
              <Calendar size={12} strokeWidth={2} />
              {initiative.timeline}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-ink tracking-tight leading-snug group-hover:text-accent transition-colors line-clamp-2">
            {initiative.name}
          </h3>

          {/* Vision description */}
          <p className="mt-2 text-sm text-muted line-clamp-2 leading-relaxed">
            {initiative.description}
          </p>

          {/* Tech stack badges */}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {initiative.techStack?.slice(0, 4).map((tech, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-panel-alt text-ink border border-border"
              >
                <Tag size={10} strokeWidth={2} className="text-faint" />
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 border-t border-border-soft pt-4 flex items-center justify-between">
          <span className="text-xs font-medium text-faint">
            Updated {formatRelativeTime(initiative.updated_at ?? initiative.created_at)}
          </span>
          <button
            type="button"
            className="h-8 px-4 bg-ink hover:bg-ink text-on-ink font-semibold text-xs rounded-full flex items-center gap-1.5 transition-transform duration-150 active:scale-95 cursor-pointer shadow-xs"
          >
            <span>Open Board</span>
            <ArrowRight size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function InitiativeListRow({
  initiative,
  onOpen,
}: {
  initiative: Initiative;
  onOpen: () => void;
}) {
  const badge = getStatusBadge(initiative.status);

  return (
    <motion.li variants={itemVariants} className="list-none mb-2.5">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="group relative flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer bg-panel hover:border-border border border-border rounded-2xl p-4 text-left transition-all duration-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-border"
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink shadow-xs"
            style={{ background: coverGradient(initiative.id) }}
            aria-hidden="true"
          >
            <Layers size={20} strokeWidth={2.2} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                {badge.label}
              </span>
              <h4 className="text-sm font-semibold text-ink group-hover:text-accent transition-colors truncate">
                {initiative.name}
              </h4>
            </div>

            <p className="mt-1 text-xs text-muted truncate max-w-xl leading-relaxed">
              {initiative.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5">
            {initiative.techStack?.slice(0, 3).map((tech, i) => (
              <span
                key={i}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-panel-alt text-ink"
              >
                {tech}
              </span>
            ))}
          </div>

          <span className="text-xs font-medium text-muted px-3 py-1 rounded-full bg-panel-alt">
            {initiative.timeline}
          </span>

          <button
            type="button"
            className="h-8 px-4 bg-ink text-on-ink hover:bg-ink text-xs font-semibold rounded-full flex items-center gap-1 transition-transform duration-150 active:scale-95 cursor-pointer shadow-xs"
          >
            <span>Inspect</span>
            <ChevronRight size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function InitiativesListPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InitiativeStatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pipelineLoads, setPipelineLoads] = useState([92, 88, 96, 84]);
  const [creditPreview, setCreditPreview] = useState<CreditPreview | null>(
    LIVE_MODE ? null : { cost: 10, free_available: false, credits_remaining: 450 }
  );

  const inputRef = useRef<HTMLInputElement>(null);

  const handleSound = (type: "click" | "switch" = "click") => {
    if (!soundEnabled) return;
    if (type === "switch") {
      synth.playSwitch();
    } else {
      synth.playClick();
    }
  };

  const handleChannelClick = (idx: number) => {
    handleSound("click");
    setPipelineLoads((prev) => {
      const next = [...prev];
      next[idx] = Math.floor(Math.random() * 25) + 75;
      return next;
    });
  };

  const load = () => {
    if (LIVE_MODE) {
      // Backend is the source of truth: an empty account shows an empty
      // list, not sample data the user can't open.
      initiativesApi
        .list()
        .then((data: any[]) => {
          setInitiatives(Array.isArray(data) ? data.map(toDisplayInitiative) : []);
        })
        .catch(() => {
          setInitiatives([]);
          toast.error("Couldn't load your initiatives.");
        });
    } else {
      const locals = getLocalInitiatives();
      const combined = [
        ...locals,
        ...SAMPLE_INITIATIVES.filter((s) => !locals.some((l) => l.id === s.id)),
      ];
      setInitiatives(combined.map(toDisplayInitiative));
    }
  };

  const loadCredits = useCallback(() => {
    if (!LIVE_MODE) return;
    initiativesApi
      .creditPreview()
      .then(setCreditPreview)
      .catch(() => {
        setCreditPreview(null);
      });
  }, []);

  useEffect(load, []);
  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  const totalInitiatives = initiatives?.length ?? 0;
  const activeCount = useMemo(
    () =>
      (initiatives ?? []).filter((i) => i.status === "generating" || i.status === "active").length,
    [initiatives]
  );
  const planningCount = useMemo(
    () => (initiatives ?? []).filter((i) => i.status === "generating").length,
    [initiatives]
  );
  const completedCount = useMemo(
    () => (initiatives ?? []).filter((i) => i.status === "completed").length,
    [initiatives]
  );

  const [generationPhase, setGenerationPhase] = useState<string>("");
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [clarificationPrompt, setClarificationPrompt] = useState("");

  const handleOpenClarification = (targetPrompt?: string) => {
    const p = (targetPrompt ?? prompt).trim();
    if (!p) return;
    handleSound("switch");
    setClarificationPrompt(p);
    setShowClarificationModal(true);
  };

  const handleGenerateWithClarifications = async (
    targetPrompt: string,
    clarifications: Record<string, string>,
    additionalNotes: string
  ) => {
    const trimmed = targetPrompt.trim();
    if (!trimmed) return;
    handleSound("click");
    setCreating(true);
    setShowClarificationModal(false);
    setGenerationPhase("Synthesizing multi-agent architecture and epics with Gemini 2.5 Flash...");

    if (LIVE_MODE) {
      try {
        const initiative = await initiativesApi.create({
          prompt: trimmed,
          clarifications,
          additional_notes: additionalNotes,
        } as any);
        captureEvent("initiative_created", { initiative_id: initiative.id });
        loadCredits();
        navigate(`/initiatives/${initiative.id}`);
        return;
      } catch (err: any) {
        if (err?.response?.status === 402) {
          loadCredits();
          toast.error(
            err?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
          );
          setCreating(false);
          navigate("/billing");
          return;
        }
        // Don't fall through to the client-side generator: it would create
        // an initiative that only exists in this browser and 404s on open.
        const detail = err?.response?.data?.detail;
        toast.error(typeof detail === "string" ? detail : "Couldn't create the initiative.");
        setCreating(false);
        setGenerationPhase("");
        return;
      }
    }

    try {
      const pkg = await generateInitiativeWithGemini(
        trimmed,
        (phase) => {
          setGenerationPhase(phase);
        },
        clarifications,
        additionalNotes
      );
      captureEvent("initiative_created", { initiative_id: pkg.initiative.id });
      toast.success("Initiative architecture plan generated successfully!");
      setCreating(false);
      navigate(`/initiatives/${pkg.initiative.id}`);
    } catch (err: any) {
      console.warn("Gemini generation error, falling back to simulated:", err);
      toast.error(err?.message || "Gemini connection error. Using simulated fallback.");
      const simulated = createSimulatedInitiative(trimmed, clarifications, additionalNotes);
      setCreating(false);
      navigate(`/initiatives/${simulated.id}`);
    }
  };

  const handleCreate = () => {
    handleOpenClarification();
  };

  const visibleInitiatives = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (initiatives ?? []).filter((i) => {
      if (statusFilter === "active" && i.status !== "generating" && i.status !== "active")
        return false;
      if (statusFilter === "complete" && i.status !== "completed" && i.status !== "active")
        return false;
      if (statusFilter === "failed" && i.status !== "failed") return false;
      if (
        q &&
        !i.name.toLowerCase().includes(q) &&
        !(i.description || "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
    if (sortKey === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === "status")
      return [...filtered].sort((a, b) => (a.status || "").localeCompare(b.status || ""));
    return filtered;
  }, [initiatives, search, statusFilter, sortKey]);

  const bottomNavItems: BottomNavItem[] = useMemo(() => [
    {
      id: "all",
      label: "All Initiatives",
      badge: totalInitiatives,
      isActive: statusFilter === "all",
      onClick: () => {
        handleSound();
        setStatusFilter("all");
      },
    },
    {
      id: "active",
      label: "Active",
      badge: activeCount,
      isActive: statusFilter === "active",
      onClick: () => {
        handleSound();
        setStatusFilter("active");
      },
    },
    {
      id: "planning",
      label: "Planning",
      badge: planningCount,
      isActive: statusFilter === "active" && Boolean(creating),
      onClick: () => {
        handleSound();
        setStatusFilter("active");
      },
    },
    {
      id: "complete",
      label: "Completed",
      badge: completedCount,
      isActive: statusFilter === "complete",
      onClick: () => {
        handleSound();
        setStatusFilter("complete");
      },
    },
    {
      id: "templates",
      label: "Templates",
      onClick: () => {
        handleSound();
        inputRef.current?.focus();
        setPrompt("AI SaaS Platform");
      },
    },
    {
      id: "docs",
      label: "Handbook",
      isExternal: true,
      onClick: () => {
        toast("Opening Autonomous Agent Handbook");
      },
    },
    {
      id: "discord",
      label: "Discord",
      isExternal: true,
      onClick: () => {
        toast("Opening Developer Community");
      },
    },
  ], [totalInitiatives, activeCount, planningCount, completedCount, statusFilter, creating, handleSound]);

  return (
    <div className="relative min-h-screen w-full bg-info/10 p-1.5 sm:p-3 md:p-4 font-sans antialiased text-ink transition-colors duration-200 flex flex-col items-stretch justify-start">
      <div className="w-full flex-1 flex flex-col">
        <SuiWindowFrame
          title="Forge Initiatives 2026"
          tagLabel="date"
          tagText="February–August, 2026"
          navPosition="top"
          navItems={bottomNavItems}
          bottomNavItems={bottomNavItems}
          primaryAction={{
            label: "Create Initiative",
            icon: <Sparkles size={14} className="text-warn" />,
            onClick: () => {
              handleSound();
              inputRef.current?.focus();
              const el = document.getElementById("prd-synthesizer");
              el?.scrollIntoView({ behavior: "smooth" });
            },
          }}
        >
          <div className="space-y-8 sm:space-y-10">
            {/* =========================================================================
                HERO SECTION: SUI OVERFLOW 2025 AESTHETIC
                - Left: Bold Headline + Subtitle + Signature Dual CTA Unit
                - Right: Chunky 3D Candy Keycaps + Code Key + Speech Bubble + Cursors
            ========================================================================= */}
            <section aria-label="Initiatives Hero" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
              {/* Left Column: Bold Typography & Signature Paired CTA */}
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-ink leading-[1.08]">
                    Forge Swarm 2026
                  </h1>
                  <p className="mt-2 text-base sm:text-lg font-semibold text-ink">
                    February–August, 2026
                  </p>
                </div>

                <p className="text-sm sm:text-base text-muted max-w-xl leading-relaxed">
                  Turn visionary ideas into production-ready software systems. 8 coordinated AI specialist agents architect PRDs, manage epics, orchestrate autonomous sprints, and verify deployment.
                </p>

                {/* Signature Sui Overflow Paired CTA Unit */}
                <div className="flex items-center gap-2 pt-1">
                  {/* Primary Black Rectangular Button */}
                  <button
                    type="button"
                    onClick={() => {
                      handleSound();
                      inputRef.current?.focus();
                      const el = document.getElementById("prd-synthesizer");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="h-11 sm:h-12 px-7 sm:px-8 bg-ink hover:bg-ink text-on-ink rounded-lg text-sm sm:text-base font-semibold tracking-tight active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Register Initiative</span>
                  </button>

                  {/* Adjacent Sky-Blue Square Button with Arrow */}
                  <button
                    type="button"
                    onClick={() => {
                      handleSound();
                      handleOpenClarification();
                    }}
                    className="h-11 sm:h-12 w-11 sm:w-12 bg-info/10 hover:bg-info/20 text-ink border-2 border-border rounded-lg active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer"
                    title="Launch Guided Architecture Survey"
                    aria-label="Open Guided Architecture Survey"
                  >
                    <ArrowUpRight size={20} strokeWidth={2.6} />
                  </button>
                </div>

                {/* Micro Stats Row */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-panel border border-border text-xs font-semibold text-ink">
                    <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
                    <span>8 Specialist Agents Active</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-panel border border-border text-xs font-semibold text-ink">
                    <Star size={13} className="text-warn fill-warn" />
                    <span>{totalInitiatives} Initiatives</span>
                  </div>
                  {creditPreview && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-panel border border-border text-xs font-semibold text-accent">
                      <Coins size={13} className="text-warn" />
                      <span>{creditPreview.credits_remaining} Credits</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: 3D Candy Keycaps & Cursors Graphic */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-[440px] bg-panel/80 rounded-2xl border-2 border-border p-4">
                  <SuiKeycapVisual
                    title="OVERFLOW"
                    onKeyClick={(char) => {
                      synth.playClick(600);
                      toast(`Key ${char} selected · AI Agent Assigned`);
                    }}
                  />
                </div>
              </div>
            </section>

        {/* =========================================================================
            3. PRD SYNTHESIZER WORKBENCH (INTERACTIVE CREATION BAR)
        ========================================================================= */}
        <section aria-label="PRD Synthesizer Workbench" className="bg-panel rounded-3xl p-5 sm:p-6 border border-border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-soft pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info/10 text-info">
                <Sparkles size={15} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                Autonomous PRD Synthesizer
              </span>
            </div>

            {creditPreview && (
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                <Coins size={13} className="text-warn" />
                <span>
                  {creditPreview.free_available ? "First Run Free" : `${creditPreview.cost} Credits/Run`}
                </span>
                <span>•</span>
                <span className="text-accent font-semibold">
                  {creditPreview.credits_remaining} credits remaining
                </span>
              </div>
            )}
          </div>

          {/* Form input line */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-panel p-2 rounded-2xl border border-border focus-within:border-border transition"
          >
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe a product to plan end-to-end (e.g. Telehealth Portal, FinTech Ledger)…"
              aria-label="Describe a product to plan end-to-end…"
              className="flex-1 bg-transparent px-3 py-2 text-sm font-medium text-ink placeholder:text-faint focus:outline-none min-w-0"
            />

            <div className="flex items-center gap-2 shrink-0">
              <VoiceInputButton
                id="voice-initiatives-prompt"
                label="Voice Input"
                currentValue={prompt}
                onTextCaptured={(spokenText) => setPrompt(spokenText)}
                variant="button"
              />

              <button
                type="submit"
                disabled={creating || !prompt.trim()}
                aria-label="Generate Plan"
                className="h-10 px-6 bg-ink hover:bg-ink text-on-ink font-semibold text-xs rounded-full shadow-sm transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles size={13} strokeWidth={2.4} />
                <span>{creating ? "Synthesizing…" : "Generate Plan ↵"}</span>
              </button>
            </div>
          </form>

          {/* Quick Recipe Chips */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs pt-1 scrollbar-none">
            <span className="font-semibold text-faint uppercase tracking-wider text-[11px] shrink-0">
              Quick Starters:
            </span>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  handleSound();
                  setPrompt(suggestion);
                  handleOpenClarification(suggestion);
                }}
                className="shrink-0 px-3 py-1 rounded-full bg-panel-alt text-ink hover:bg-ink/5 font-medium transition cursor-pointer text-xs"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Live Generating Signal */}
          {creating && (
            <div className="p-4 rounded-2xl bg-info/10 border border-info/30 flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 font-semibold text-accent">
                <span className="h-2 w-2 rounded-full bg-info animate-ping" />
                <span>{generationPhase || "8 Autonomous Specialist Agents Active..."}</span>
              </span>
              <span className="text-accent font-medium text-[11px]">
                Deterministic PRD Decomposition · ~20s
              </span>
            </div>
          )}
        </section>

        {/* =========================================================================
            4. INITIATIVES REPOSITORY (FILTERABLE LIBRARY VIEW)
        ========================================================================= */}
        <section id="initiatives-repository" aria-label="Initiatives library" className="space-y-6">
          {/* Header & Controls Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Kanban size={18} className="text-ink" />
                <h2 className="text-xl font-semibold tracking-tight text-ink">
                  Initiative Repository
                </h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-high text-ink text-xs font-semibold">
                {visibleInitiatives.length} Plans
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
                  aria-label="Search initiatives"
                  className="h-9 w-full rounded-full border border-border bg-panel pl-9 pr-3 text-xs font-medium text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-border"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1 bg-panel-alt p-1 rounded-full">
                {(
                  [
                    { id: "all", label: `All (${totalInitiatives})` },
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
                          ? "bg-panel text-ink shadow-xs"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>

              {/* Auxiliary Selects for Automated Tests & Accessibility */}
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => {
                  handleSound();
                  setStatusFilter(e.target.value as InitiativeStatusFilter);
                }}
                className="sr-only"
              >
                <option value="all">FILTER: ALL</option>
                <option value="active">FILTER: ACTIVE</option>
                <option value="complete">FILTER: COMPLETED</option>
                <option value="failed">FILTER: FAILED</option>
              </select>

              <select
                value={sortKey}
                onChange={(e) => {
                  handleSound();
                  setSortKey(e.target.value as SortKey);
                }}
                aria-label="Sort by"
                className="h-9 rounded-full border border-border bg-panel px-3 text-xs font-semibold text-ink focus:outline-none cursor-pointer"
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
                <option value="status">Status</option>
              </select>

              {/* View Mode Toggle */}
              <div
                className="flex items-center gap-1 bg-panel-alt p-1 rounded-full"
                role="group"
                aria-label="View mode"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setViewMode("icons");
                  }}
                  aria-label="Icon view"
                  aria-pressed={viewMode === "icons"}
                  className={`h-7 w-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                    viewMode === "icons"
                      ? "bg-panel text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <LayoutGrid size={14} aria-hidden="true" strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setViewMode("list");
                  }}
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  className={`h-7 w-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                    viewMode === "list"
                      ? "bg-panel text-ink shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <List size={14} aria-hidden="true" strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </div>

          {/* Library Content Grid / List */}
          <div>
            {initiatives === null ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <SkeletonCard count={3} />
              </div>
            ) : initiatives.length === 0 ? (
              <div className="py-14 bg-panel rounded-3xl border border-border p-8 text-center">
                <EmptyState
                  icon={Rocket}
                  title="No initiatives yet"
                  description="Describe an idea above to generate your first architecture plan."
                  primaryAction={{
                    label: "Create your first initiative",
                    onClick: () => inputRef.current?.focus(),
                  }}
                />
              </div>
            ) : visibleInitiatives.length === 0 ? (
              <div className="py-14 bg-panel rounded-3xl border border-border p-8 text-center">
                <EmptyState
                  icon={FolderSearch}
                  title="No matches"
                  description={search ? `No results for "${search}".` : "Try a different filter."}
                  secondaryAction={{
                    label: "Clear filters",
                    onClick: () => {
                      setSearch("");
                      setStatusFilter("all");
                    },
                  }}
                />
              </div>
            ) : viewMode === "icons" ? (
              <motion.div
                variants={gridVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {visibleInitiatives.map((initiative) => (
                  <InitiativeCard
                    key={initiative.id}
                    initiative={initiative}
                    onOpen={() => {
                      handleSound();
                      navigate(`/initiatives/${initiative.id}`);
                    }}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.ul
                variants={gridVariants}
                initial="hidden"
                animate="show"
                className="space-y-3 p-0 m-0"
              >
                {visibleInitiatives.map((initiative) => (
                  <InitiativeListRow
                    key={initiative.id}
                    initiative={initiative}
                    onOpen={() => {
                      handleSound();
                      navigate(`/initiatives/${initiative.id}`);
                    }}
                  />
                ))}
              </motion.ul>
            )}
          </div>
        </section>
          </div>
        </SuiWindowFrame>
      </div>

      {/* Interactive Requirements Survey Component */}
      <RequirementsSurvey
        isOpen={showClarificationModal}
        prompt={clarificationPrompt}
        onClose={() => setShowClarificationModal(false)}
        onGenerate={handleGenerateWithClarifications}
        isGenerating={creating}
      />
    </div>
  );
}
