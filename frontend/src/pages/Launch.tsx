import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import gsap from "gsap";
import { AGENTS } from "../lib/agents";
import { coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT } from "../lib/skillVisuals";
import { motionVariants } from "../lib/animations";
import { presets } from "../lib/animationPresets";
import LaunchGlobe from "../components/LaunchGlobe";
import { LandingPageBody, Nav as SiteNav, Footer as SiteFooter } from "./LandingPage";

// Public entry at "/": grey maximal OS boot + globe, then shared marketing body.

const EXAMPLE_PROMPTS = [
  "a habit tracker with streaks and reminders",
  "an invoicing app for freelancers",
  "a booking site for my yoga studio",
  "an internal tool to triage support tickets",
  "a marketplace for vintage synthesizers",
];

const TICKER = [
  "SIX BUILD AGENTS IN ORBIT",
  "GREY MAXIMAL ENGINEERING OS",
  "PLAN · BUILD · VALIDATE · SHIP",
  "NOT A DASHBOARD — AN OPERATING SYSTEM",
];

export default function Launch() {
  const reduceMotion = useReducedMotion();
  const stats = coverageStats();

  return (
    <div className="launch-os w-full scroll-smooth bg-base text-ink">
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="launch-os-wash absolute inset-0" />
        <Starfield />
        {/* Globe sits low-right so its rim never slices the brand mark. */}
        <div className="launch-globe-stage absolute inset-0">
          <LaunchGlobe />
          <OrbitingAgents />
        </div>
        <div className="launch-name-clear absolute inset-0" />
      </div>

      <section
        id="top"
        className="relative z-10 flex h-[100dvh] w-screen flex-col overflow-hidden text-ink"
      >
        {/* Space for fixed SiteNav */}
        <div className="h-14 shrink-0 md:h-16" aria-hidden="true" />

        <div className="relative z-20 overflow-hidden border-y border-white/10 bg-black/50" aria-hidden="true">
          <div className="launch-ticker-track flex whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-muted">
            {[...TICKER, ...TICKER].map((bit, i) => (
              <span key={`${bit}-${i}`} className="mx-6 py-1">
                ◆ {bit} · {ORG_ROLE_COUNT} ORG · {PLAYBOOK_COUNT} PLAYBOOKS
              </span>
            ))}
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          <SynapseField />
          <MissionControlHUD />
          <StatusPanel />
        </motion.div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pointer-events-none sm:px-6">
          <motion.div
            className="flex w-full max-w-3xl flex-col items-center text-center"
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            <motion.p
              className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-muted [text-shadow:0_1px_12px_rgba(0,0,0,0.9)]"
              variants={motionVariants.staggerItem}
            >
              Engineering OS · Public Boot
            </motion.p>

            <motion.h1
              className="font-brand text-[clamp(3.5rem,14vw,7.5rem)] font-extrabold uppercase leading-[0.85] tracking-[-0.05em] [text-shadow:0_2px_24px_rgba(0,0,0,0.85)]"
              variants={motionVariants.staggerItem}
            >
              Forge
            </motion.h1>

            <motion.p
              className="mt-4 max-w-md text-sm text-muted md:text-base [text-shadow:0_1px_12px_rgba(0,0,0,0.9)]"
              variants={motionVariants.staggerItem}
            >
              Six agents. One prompt. Production software.
            </motion.p>

            <motion.div className="w-full" variants={motionVariants.staggerItem}>
              <PromptBar />
            </motion.div>

            <motion.div variants={motionVariants.staggerItem}>
              <a
                href="#problem"
                className="pointer-events-auto mt-6 inline-flex items-center gap-1.5 border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted transition hover:border-white/30 hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/60"
              >
                Enter system <ArrowRight className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
              </a>
            </motion.div>
          </motion.div>
        </div>

        <motion.footer
          className="relative z-10 border-t border-white/10 bg-black/55 px-3 py-3 backdrop-blur-md sm:px-5"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25, ease: "easeOut" }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-faint">
              Agent fleet online
            </p>
            <p className="font-mono text-[9px] uppercase tracking-wide text-faint">
              {stats.full} full visuals
            </p>
          </div>
          <ul
            aria-label="Forge build agents"
            className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {AGENTS.map((agent) => {
              const Icon = agent.icon;
              return (
                <li
                  key={agent.id}
                  className="flex min-w-[4.75rem] flex-col items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-2"
                  style={{ boxShadow: `inset 0 -2px 0 ${agent.hue}` }}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ background: `${agent.hue}22`, color: agent.hue }}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="truncate text-[10px] font-medium text-ink/90">{agent.label}</span>
                </li>
              );
            })}
          </ul>
        </motion.footer>
      </section>

      <SiteNav />
      <div className="relative z-10">
        <main id="main-content">
          <LandingPageBody />
        </main>
        <SiteFooter />
      </div>
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
    <form
      onSubmit={onSubmit}
      className="pointer-events-auto mt-8 flex w-full items-center gap-2 rounded-xl border-2 border-white/20 bg-black/55 px-3 py-2.5 text-left shadow-[0_0_40px_-16px_rgba(244,244,245,0.35)] backdrop-blur-md transition-shadow focus-within:border-ink/50 focus-within:shadow-[0_0_0_3px_rgba(212,212,216,0.12)] sm:gap-3 sm:px-4"
      onClick={() => inputRef.current?.focus()}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/15 font-mono text-sm text-ink"
        aria-hidden="true"
      >
        $
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Describe what you want to build"
          className="w-full bg-transparent font-mono text-sm text-ink placeholder-transparent focus:outline-none"
        />
        {value === "" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center truncate font-mono text-sm text-faint"
          >
            <span className="mr-1.5 hidden text-muted sm:inline">forge build</span>
            <span className="truncate">{placeholder}</span>
            <span className="ml-px animate-[blink_1s_step-end_infinite] text-muted motion-reduce:animate-none">
              ▋
            </span>
          </span>
        )}
      </div>
      <motion.button
        type="submit"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-2 text-sm font-bold uppercase tracking-wide text-base transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60 sm:gap-1.5 sm:px-4"
        {...presets.button}
      >
        Build <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </motion.button>
    </form>
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

function OrbitingAgents() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  // Rings stay on the globe stage (lower-right). No pulse rings through the
  // brand — those cut the letters and read as a bad halo on the name.
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      {AGENTS.map((agent, i) => {
        const diameter = 72 + i * 12;
        const duration = 26 + i * 7;
        return (
          <div
            key={agent.id}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-orbit-spin rounded-full motion-reduce:animate-none"
            style={{
              width: `min(${diameter}vh, ${diameter}vw)`,
              height: `min(${diameter}vh, ${diameter}vw)`,
              animationDuration: `${duration}s`,
              animationDirection: i % 2 === 1 ? "reverse" : "normal",
            }}
          >
            <span
              title={agent.label}
              className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: agent.hue, boxShadow: `0 0 8px 1px ${agent.hue}99` }}
            />
          </div>
        );
      })}
    </div>
  );
}

const SYNAPSE_NODES = [
  { x: 93, y: 70 },
  { x: 84, y: 64 },
  { x: 95, y: 84 },
  { x: 79, y: 88 },
  { x: 88, y: 92 },
];

const SYNAPSE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [0, 3],
  [3, 4],
  [4, 2],
];

function SynapseField() {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-synapse-line]", {
        opacity: 0,
        duration: 1.6,
        stagger: 0.05,
        ease: "power1.out",
      });
      gsap.to("[data-synapse-node]", {
        opacity: 0.15,
        scale: 0.6,
        transformOrigin: "center",
        duration: 2.2,
        repeat: -1,
        yoyo: true,
        stagger: { each: 0.4, from: "random" },
        ease: "sine.inOut",
      });
    }, rootRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  if (reduceMotion) return null;

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {SYNAPSE_EDGES.map(([a, b], i) => {
          const from = SYNAPSE_NODES[a];
          const to = SYNAPSE_NODES[b];
          return (
            <line
              key={i}
              data-synapse-line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="hsl(0 0% 96% / 0.14)"
              strokeWidth={0.15}
            />
          );
        })}
      </svg>
      {SYNAPSE_NODES.map((n, i) => (
        <span
          key={i}
          data-synapse-node
          className="absolute h-1 w-1 rounded-full bg-ink/45"
          style={{ top: `${n.y}%`, left: `${n.x}%`, marginTop: -2, marginLeft: -2 }}
        />
      ))}
    </div>
  );
}

function StatusPanel() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <aside
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[7.5rem] right-4 z-10 hidden w-44 border border-white/15 bg-black/55 p-3 font-mono text-[9px] uppercase tracking-wide text-muted backdrop-blur-md sm:block md:right-6"
    >
      <p className="mb-2 font-bold text-ink/80">System · Live</p>
      <ul className="space-y-1.5">
        <li className="flex justify-between gap-2">
          <span>Globe</span>
          <span className="text-ink">online</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Agents</span>
          <span className="text-ink">{AGENTS.length}/6</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Org roles</span>
          <span className="text-ink">{ORG_ROLE_COUNT}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Palette</span>
          <span className="text-ink">graphite</span>
        </li>
      </ul>
    </aside>
  );
}

const HUD_TICKS = Array.from({ length: 36 }, (_, i) => i * 10);
const HUD_OUTER_DURATION = 46;

function useDegreeReadout(durationSeconds: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || !ref.current) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsedFraction = ((now - start) / 1000 / durationSeconds) % 1;
      const deg = Math.floor(elapsedFraction * 360);
      if (ref.current) ref.current.textContent = `${deg.toString().padStart(3, "0")}°`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationSeconds, reduceMotion]);

  return ref;
}

function MissionControlHUD() {
  const reduceMotion = useReducedMotion();
  const degreeRef = useDegreeReadout(HUD_OUTER_DURATION);
  if (reduceMotion) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute opacity-70"
        style={{ top: "22%", left: "5%" }}
    >
      <div className="relative h-16 w-16 sm:h-20 sm:w-20">
        <span className="absolute -left-2 -top-2 h-3 w-3 border-l border-t border-ink/35" />
        <span className="absolute -right-2 -top-2 h-3 w-3 border-r border-t border-ink/35" />
        <span className="absolute -bottom-2 -left-2 h-3 w-3 border-b border-l border-ink/35" />
        <span className="absolute -bottom-2 -right-2 h-3 w-3 border-b border-r border-ink/35" />

        <div className="absolute inset-[4%] overflow-hidden rounded-full">
          <div
            className="absolute inset-0 animate-orbit-spin motion-reduce:hidden"
            style={{
              animationDuration: "3.6s",
              background: "conic-gradient(from 0deg, hsl(0 0% 85% / 0.35), transparent 42deg)",
            }}
          />
        </div>

        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full animate-orbit-spin motion-reduce:animate-none"
          style={{ animationDuration: `${HUD_OUTER_DURATION}s` }}
        >
          <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(0 0% 96% / 0.16)" strokeWidth="0.6" />
          {HUD_TICKS.map((deg) => {
            const major = deg % 90 === 0;
            const mid = !major && deg % 30 === 0;
            const y1 = major ? 3 : mid ? 4.5 : 6;
            const y2 = major ? 11 : mid ? 9 : 7.5;
            const opacity = major ? 0.5 : mid ? 0.3 : 0.16;
            const width = major ? 0.8 : mid ? 0.6 : 0.35;
            return (
              <line
                key={deg}
                x1="50"
                y1={y1}
                x2="50"
                y2={y2}
                stroke={`hsl(0 0% 96% / ${opacity})`}
                strokeWidth={width}
                transform={`rotate(${deg} 50 50)`}
              />
            );
          })}
        </svg>

        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full animate-orbit-spin motion-reduce:animate-none"
          style={{ animationDuration: "30s", animationDirection: "reverse" }}
        >
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke="hsl(0 0% 96% / 0.14)"
            strokeWidth="0.5"
            strokeDasharray="2 3"
          />
        </svg>

        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <line x1="50" y1="40" x2="50" y2="60" stroke="hsl(0 0% 96% / 0.28)" strokeWidth="0.6" />
          <line x1="40" y1="50" x2="60" y2="50" stroke="hsl(0 0% 96% / 0.28)" strokeWidth="0.6" />
        </svg>
        <span
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 animate-tick rounded-full bg-ink"
          style={{ marginTop: -3, marginLeft: -3 }}
        />

        <span
          ref={degreeRef}
          className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 font-mono text-[8px] tabular-nums tracking-[0.1em] text-ink/45"
        >
          000°
        </span>
      </div>
    </div>
  );
}

function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() < 0.2 ? 2 : 1,
        opacity: 0.12 + Math.random() * 0.4,
      })),
    [],
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-ink"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
