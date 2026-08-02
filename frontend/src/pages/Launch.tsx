import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import gsap from "gsap";
import { AGENTS } from "../lib/agents";
import { coverageStats } from "../lib/skillVisuals";
import { presets } from "../lib/animationPresets";
import LaunchGlobe from "../components/LaunchGlobe";
import Globe3D from "../components/Globe3D";
import { LandingPageBody, Nav as SiteNav, Footer as SiteFooter } from "./LandingPage";

const EXAMPLE_PROMPTS = [
  "A habit tracker with streaks and reminders",
  "An invoicing app for freelancers",
  "A booking site for a yoga studio",
  "An internal tool to triage support tickets",
  "A marketplace for vintage synthesizers",
];

const AGENT_SHORT: Record<(typeof AGENTS)[number]["id"], string> = {
  architect: "ARCH",
  business_improver: "OPS",
  designer: "DES",
  developer: "DEV",
  integration: "INT",
  pm: "PM",
};

const AGENT_TASK: Record<(typeof AGENTS)[number]["id"], string> = {
  architect: "Designing the architecture",
  business_improver: "Optimizing the model",
  designer: "Crafting the interface",
  developer: "Building production code",
  integration: "Connecting services",
  pm: "Validating release readiness",
};

export default function Launch() {
  const reduceMotion = useReducedMotion();
  const stats = coverageStats();
  const [activeAgentId, setActiveAgentId] = useState<(typeof AGENTS)[number]["id"]>(AGENTS[0].id);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [globeMode, setGlobeMode] = useState<"cobe" | "three">("cobe");

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const progress = height > 0 ? Math.max(0, Math.min(1, scrollY / height)) : 0;
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const globeScale = reduceMotion ? 1 : 1 + scrollProgress * 1.2;
  const globeOpacity = 1 - scrollProgress * 0.5;

  return (
    <div className="launch-os w-full scroll-smooth bg-base text-ink">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="launch-atmosphere absolute inset-0" />
        <div className="launch-globe-stage absolute inset-0 opacity-80" style={{ transform: `scale(${globeScale})`, opacity: globeOpacity }}>
          {globeMode === "cobe" ? (
            <LaunchGlobe activeAgentId={activeAgentId} />
          ) : (
            <Globe3D activeAgentId={activeAgentId} />
          )}
        </div>
        <div className="launch-name-veil absolute inset-0" />
      </div>

      <section
        id="top"
        className="relative z-10 flex min-h-[100dvh] w-screen flex-col overflow-hidden"
      >
        <div className="h-16 shrink-0 md:h-[4.25rem]" aria-hidden="true" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pointer-events-none sm:px-8">
          <motion.div
            className="flex w-full max-w-3xl flex-col items-center text-center"
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
            }}
          >
            <motion.p
              className="mb-5 text-[13px] font-medium tracking-[0.04em] text-muted"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              Software engineering, reimagined
            </motion.p>

            <motion.h1
              className="launch-brand font-brand text-[clamp(3.5rem,12vw,72px)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink"
              variants={{
                hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            >
              Forge.
            </motion.h1>

            <motion.p
              className="mt-5 max-w-xl text-[19px] leading-relaxed text-muted sm:text-[21px]"
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
            >
              Turn ideas into production-ready software. Describe what you want to build, and let the system architect, design, and ship it.
            </motion.p>

            <motion.div
              className="w-full max-w-2xl"
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
            >
              <PromptBar />
            </motion.div>
          </motion.div>
        </div>

        <AgentPipelineDock fullVisuals={stats.full} activeAgentId={activeAgentId} onActiveAgentChange={setActiveAgentId} globeMode={globeMode} onGlobeModeChange={setGlobeMode} />
      </section>

      <SiteNav />
      <div className="relative z-10 bg-base">
        <main id="main-content">
          <LandingPageBody />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function AgentPipelineDock({ fullVisuals, activeAgentId, onActiveAgentChange, globeMode, onGlobeModeChange }: { fullVisuals: number; activeAgentId: (typeof AGENTS)[number]["id"]; onActiveAgentChange: (id: (typeof AGENTS)[number]["id"]) => void; globeMode: "cobe" | "three"; onGlobeModeChange: (mode: "cobe" | "three") => void }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const railRef = useRef<HTMLUListElement>(null);
  const activeIndex = AGENTS.findIndex((a) => a.id === activeAgentId);
  const LiveIcon = AGENTS[activeIndex >= 0 ? activeIndex : 0].icon;
  const live = AGENTS[activeIndex >= 0 ? activeIndex : 0];

  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      const next = (activeIndexRef.current + 1) % AGENTS.length
      onActiveAgentChange(AGENTS[next].id)
    }, 2800);
    return () => window.clearInterval(id);
  }, [reduceMotion, onActiveAgentChange]);

  useEffect(() => {
    if (reduceMotion || !railRef.current) return;
    const nodes = railRef.current.querySelectorAll("[data-fleet-node]");
    const ctx = gsap.context(() => {
      gsap.from(nodes, {
        opacity: 0,
        y: 8,
        stagger: 0.04,
        duration: 0.35,
        ease: "power3.out",
        delay: 0.2,
      });
    }, railRef);
    return () => ctx.revert();
  }, [reduceMotion, open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const progress = (activeIndex / Math.max(AGENTS.length - 1, 1)) * 100;

  return (
    <div
      className={[
        "launch-chat fixed right-4 z-40 flex items-end gap-3 transition-all duration-300 sm:right-6",
        scrolled ? "bottom-5" : "bottom-6",
      ].join(" ")}
    >
      <motion.div
        className="flex max-w-sm flex-col items-end gap-2 overflow-hidden sm:max-w-md"
        initial={false}
        animate={
          reduceMotion
            ? { height: open ? "auto" : 0, opacity: open ? 1 : 0 }
            : {
                height: open ? "auto" : 0,
                opacity: open ? 1 : 0,
                transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
              }
        }
      >
        <div className="rounded-3xl apple-glass-strong p-3 shadow-apple">
          <div className="flex items-center gap-3">
            <span
              className="launch-fleet-live-icon relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${live.hue}22`, color: live.hue }}
            >
              <LiveIcon size={16} aria-hidden="true" />
              {!reduceMotion && <span className="launch-fleet-live-ping rounded-full" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight text-ink">{live.label}</p>
              <p className="truncate text-[12px] text-muted">{AGENT_TASK[live.id]}</p>
            </div>
          </div>
          <div className="launch-fleet-track relative mt-3 h-[3px] rounded-full bg-white/[0.08]">
            <span
              className="launch-fleet-track-fill absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
            <span
              className="launch-fleet-track-head absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${progress}%` }}
            />
          </div>
          <ul ref={railRef} aria-label="Build pipeline" className="mt-3 flex shrink-0 items-center gap-1.5 overflow-x-auto">
            {AGENTS.map((agent, i) => {
              const Icon = agent.icon;
              const isActive = i === activeIndex;
              const isDone = i < activeIndex;
              return (
                <li key={agent.id} data-fleet-node>
                  <button
                    type="button"
                    title={`${agent.label}`}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`${agent.label}`}
                    onClick={() => onActiveAgentChange(agent.id)}
                    className={[
                      "launch-fleet-pill flex h-9 w-9 items-center justify-center rounded-full outline-none transition-all sm:h-10 sm:w-10",
                      "focus-visible:ring-2 focus-visible:ring-accent/40",
                      isActive ? "is-active scale-105" : "opacity-55 hover:opacity-90",
                      isDone ? "is-done" : "",
                    ].join(" ")}
                    style={
                      isActive
                        ? { background: `${agent.hue}28`, color: agent.hue, boxShadow: `0 0 0 1px ${agent.hue}55` }
                        : { color: isDone ? "#A1A1A6" : "#636366" }
                    }
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="sr-only">{AGENT_SHORT[agent.id]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-right font-mono text-[12px] tabular-nums text-faint">
            {String(activeIndex + 1).padStart(2, "0")}/{String(AGENTS.length).padStart(2, "0")}
            <span className="mx-1.5 text-white/15">·</span>
            {fullVisuals}
          </p>
        </div>
      </motion.div>

      <motion.button
        type="button"
        aria-label={open ? "Hide pipeline" : "Show pipeline"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full apple-glass-strong shadow-apple"
        animate={{ scale: scrolled ? 0.95 : 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <LiveIcon size={20} aria-hidden="true" />
      </motion.button>
      <motion.button
        type="button"
        aria-label={globeMode === "cobe" ? "Switch to 3D globe" : "Switch to globe view"}
        onClick={() => onGlobeModeChange(globeMode === "cobe" ? "three" : "cobe")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
        animate={{ scale: scrolled ? 0.95 : 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-[11px] font-semibold">{globeMode === "cobe" ? "C" : "3"}</span>
      </motion.button>
    </div>
  );
}

function PromptBar() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const placeholder = useTypedPlaceholder(EXAMPLE_PROMPTS, value === "");
  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate("/signup", { state: { prompt: value.trim() } });
  };

  return (
    <div className="pointer-events-auto mt-8 w-full">
      <form
        onSubmit={onSubmit}
        className="flex w-full items-center gap-2 rounded-full apple-glass-strong px-2 py-2 pl-4 text-left shadow-apple-lg transition focus-within:shadow-[0_0_0_4px_var(--state-focus)] sm:gap-3 sm:pl-5"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Tell us what you want to build"
            className="w-full bg-transparent text-[15px] text-ink placeholder-transparent focus:outline-none sm:text-[17px]"
          />
          {value === "" && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-faint sm:text-[17px]">
              <span className="truncate">{placeholder}</span>
              <span className="ml-0.5 animate-[blink_1s_step-end_infinite] text-accent motion-reduce:animate-none">|</span>
            </span>
          )}
        </div>
        <motion.button
          type="submit"
          className="bb-btn bb-btn-primary shrink-0 px-5 py-2.5"
          {...presets.button}
        >
          Start building <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </motion.button>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Try an example">
        {EXAMPLE_PROMPTS.slice(0, 3).map((example) => (
          <button
            key={example}
            type="button"
            className="bb-chip pointer-events-auto cursor-pointer"
            onClick={() => {
              setValue(example);
              inputRef.current?.focus();
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function useTypedPlaceholder(examples: string[], active: boolean) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(examples[0]);
      return;
    }

    let example = 0;
    let chars = 0;
    let deleting = false;
    let timer: number;

    const tick = () => {
      const current = examples[example];
      chars += deleting ? -1 : 1;
      setText(current.slice(0, chars));

      let delay = deleting ? 18 : 40 + Math.random() * 40;
      if (!deleting && chars === current.length) {
        deleting = true;
        delay = 2200;
      } else if (deleting && chars === 0) {
        deleting = false;
        example = (example + 1) % examples.length;
        delay = 400;
      }
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, [examples, active]);

  return text;
}
