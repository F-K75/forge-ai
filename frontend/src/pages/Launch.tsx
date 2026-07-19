import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import gsap from "gsap";
import { AGENTS } from "../lib/agents";
import { motionVariants } from "../lib/animations";
import { presets } from "../lib/animationPresets";
import LaunchGlobe from "../components/LaunchGlobe";
import { LandingPageBody, Nav as SiteNav, Footer as SiteFooter } from "./LandingPage";

// Public entry splash at "/": an immersive, globe-centered portal with a
// terminal-style prompt bar, followed immediately by the same content that
// lives at /home — scrolling past the globe carries straight into it instead
// of requiring a click through to a separate route. The globe/hero is its
// own h-screen section (overflow-hidden, so its decorations never leak past
// the fold); everything below is the shared LandingPageBody. The earth is a
// WebGL render (see LaunchGlobe) and can be dragged to spin. Already-
// authenticated visitors never see any of this: PublicRoute bounces them to
// /projects.

const EXAMPLE_PROMPTS = [
  "a habit tracker with streaks and reminders",
  "an invoicing app for freelancers",
  "a booking site for my yoga studio",
  "an internal tool to triage support tickets",
  "a marketplace for vintage synthesizers",
];

export default function Launch() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="w-full scroll-smooth bg-base text-ink">
      {/* Persistent backdrop — fixed to the viewport (not the hero section),
          so the globe keeps rotating in the background behind every section
          below, not just the first screen. The hero section's own background
          is transparent (see below) so this shows straight through it too. */}
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <Starfield />
        <LaunchGlobe />
        <PulseRings />
        <OrbitingAgents />
      </div>

      <section id="top" className="relative z-10 h-screen w-screen overflow-hidden text-ink flex flex-col">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        >
          <SynapseField />
          <MissionControlHUD />
        </motion.div>

        {/* No local header here — SiteNav (fixed, imported from LandingPage)
            now covers the whole merged page, including this hero, so it's
            visible immediately instead of only after scrolling past the fold. */}

        {/* pointer-events-none lets drag gestures in the empty space reach the
            globe canvas below; interactive children re-enable their own events.
            Not a <main> — the page's one <main> wraps LandingPageBody below,
            since this hero is now the first section of a longer page rather
            than the whole page. */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-6 pointer-events-none">
          <motion.div
            className="w-full max-w-xl flex flex-col items-center text-center"
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            <motion.p
              className="text-[11px] uppercase tracking-[0.3em] text-faint mb-6 [text-shadow:0_1px_10px_rgba(10,10,15,0.9)]"
              variants={motionVariants.staggerItem}
            >
              The AI engineering foundry
            </motion.p>

            <motion.h1
              className="font-raster text-4xl md:text-5xl leading-none tracking-wide [image-rendering:pixelated] [text-shadow:0_2px_0_rgba(10,10,15,0.9)]"
              variants={motionVariants.staggerItem}
            >
              Forge
            </motion.h1>

            <motion.p
              className="mt-5 text-muted [text-shadow:0_1px_10px_rgba(10,10,15,0.9)]"
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
                className="pointer-events-auto mt-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
              >
                or keep scrolling <ArrowRight className="w-3.5 h-3.5 rotate-90" aria-hidden="true" />
              </a>
            </motion.div>
          </motion.div>
        </div>

        <motion.footer
          className="relative z-10 pb-8"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
        >
          <ul aria-label="Forge build agents" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6">
            {AGENTS.map((agent) => (
              <li key={agent.id} className="flex items-center gap-1.5 text-xs text-faint">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: agent.hue, boxShadow: `0 0 6px 0 ${agent.hue}99` }}
                  aria-hidden="true"
                />
                {agent.label}
              </li>
            ))}
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

// Terminal-style prompt input. Typing is optional — submitting (with or
// without text) heads to signup, carrying the draft prompt in router state
// so a future onboarding step can pre-fill it.
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
      className="pointer-events-auto mt-10 w-full flex items-center gap-2 sm:gap-3 rounded-lg glass-strong px-3 sm:px-4 py-3 text-left focus-within:border-muted/60 focus-within:shadow-[0_0_0_1px_rgba(232,232,240,0.12),0_0_40px_rgba(232,232,240,0.06)] transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="font-mono text-sm text-muted select-none" aria-hidden="true">
        $
      </span>
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Describe what you want to build"
          className="w-full bg-transparent font-mono text-sm text-ink placeholder-transparent focus:outline-none"
        />
        {value === "" && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center pointer-events-none font-mono text-sm text-faint truncate">
            <span className="hidden sm:inline text-muted mr-1.5">forge build</span>
            <span className="truncate">{placeholder}</span>
            <span className="text-muted animate-[blink_1s_step-end_infinite] motion-reduce:animate-none ml-px">▋</span>
          </span>
        )}
      </div>
      <motion.button
        type="submit"
        className="shrink-0 inline-flex items-center gap-1 sm:gap-1.5 rounded-md gradient-ember text-base text-sm font-medium px-3 sm:px-4 py-1.5 hover:brightness-110 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        {...presets.button}
      >
        Build <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </motion.button>
    </form>
  );
}

// Types out each example prompt, holds it, deletes it, moves to the next.
// Paused while the user has typed their own text; static first example when
// the visitor prefers reduced motion.
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

// Small colored satellites — one per agent, reusing each agent's real hue —
// circling the globe on concentric rings at different speeds/directions.
// Literal read: a team of AI agents in orbit around your software.
function OrbitingAgents() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
    >
      {AGENTS.map((agent, i) => {
        const diameter = 98 + i * 15;
        const duration = 26 + i * 7;
        return (
          <div
            key={agent.id}
            className="animate-orbit-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full motion-reduce:animate-none"
            style={{
              width: `min(${diameter}vh, ${diameter}vw)`,
              height: `min(${diameter}vh, ${diameter}vw)`,
              animationDuration: `${duration}s`,
              animationDirection: i % 2 === 1 ? "reverse" : "normal",
            }}
          >
            <span
              title={agent.label}
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: agent.hue, boxShadow: `0 0 8px 1px ${agent.hue}99` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// Sonar-style rings expanding outward from the globe on a loop — reads as
// the platform actively listening/thinking, not just a static illustration.
function PulseRings() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ width: "min(92vh, 92vw)", height: "min(92vh, 92vw)" }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-pulse-ring absolute inset-0 rounded-full border border-ink/15 motion-reduce:hidden"
          style={{ animationDelay: `${i * 2}s` }}
        />
      ))}
    </div>
  );
}

// A sparse neural-network glyph tucked in the bottom-right corner — faint
// nodes and synapses that pulse at random, an ambient nod to "AI thinking"
// that never competes with the globe for attention. Fixed coordinates (not
// randomized like Starfield) so the cluster reads as a deliberate shape, not
// noise. The top-left corner runs MissionControlHUD instead (below).
const SYNAPSE_NODES = [
  { x: 93, y: 70 }, { x: 84, y: 64 }, { x: 95, y: 84 }, { x: 79, y: 88 }, { x: 88, y: 92 },
];

const SYNAPSE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 2],
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
    <div ref={rootRef} aria-hidden="true" className="absolute inset-0 pointer-events-none">
      {/* Lines only — safe to stretch to the viewport's aspect ratio. Node
          dots are separate HTML elements below so they stay circular
          (an SVG viewBox stretched with preserveAspectRatio="none" would
          squash <circle> elements into ellipses on any non-square screen). */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
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
          className="absolute w-1 h-1 rounded-full bg-ink/45"
          style={{ top: `${n.y}%`, left: `${n.x}%`, marginTop: -2, marginLeft: -2 }}
        />
      ))}
    </div>
  );
}

// Top-left corner instrument — a gyroscope-style attitude ring inside a
// viewfinder reticle, the way Endurance's docking display or Cooper Station's
// control-room readouts are staged in Interstellar: monochrome, wireframe,
// quietly technical. No literal recreation, just the same visual grammar.
// Three tick tiers (major/mid/minor), a counter-rotating dashed ring, and a
// radar-style sweep read as a real instrument rather than a static glyph —
// the degree readout is the one bit of text, and it's live: driven by a rAF
// loop reading the same clock the CSS rotation runs on, not a fake number.
const HUD_TICKS = Array.from({ length: 36 }, (_, i) => i * 10);
const HUD_OUTER_DURATION = 46;

// Mutates a ref'd span's textContent every frame instead of touching React
// state, so a 60fps readout never triggers a re-render (same pattern as
// useCountUp in lib/animations.ts).
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
      className="absolute pointer-events-none opacity-60"
      style={{ top: "13%", left: "6%" }}
    >
      <div className="relative w-16 h-16 sm:w-20 sm:h-20">
        {/* viewfinder corner brackets */}
        <span className="absolute -top-2 -left-2 w-3 h-3 border-t border-l border-ink/30" />
        <span className="absolute -top-2 -right-2 w-3 h-3 border-t border-r border-ink/30" />
        <span className="absolute -bottom-2 -left-2 w-3 h-3 border-b border-l border-ink/30" />
        <span className="absolute -bottom-2 -right-2 w-3 h-3 border-b border-r border-ink/30" />

        {/* radar sweep — clipped to the outer ring's circle so the wedge
            never spills into the box corners */}
        <div className="absolute inset-[4%] rounded-full overflow-hidden">
          <div
            className="absolute inset-0 animate-orbit-spin motion-reduce:hidden"
            style={{
              animationDuration: "3.6s",
              background: "conic-gradient(from 0deg, hsl(28 85% 55% / 0.4), transparent 42deg)",
            }}
          />
        </div>

        {/* outer tick ring — three tiers (major/mid/minor), like a real
            degree gauge, rotating slowly as one dial */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full animate-orbit-spin motion-reduce:animate-none"
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

        {/* counter-rotating dashed ring — compound gyroscope motion, the way
            a real attitude indicator layers rings moving independently */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full animate-orbit-spin motion-reduce:animate-none"
          style={{ animationDuration: "30s", animationDirection: "reverse" }}
        >
          <circle cx="50" cy="50" r="36" fill="none" stroke="hsl(0 0% 96% / 0.14)" strokeWidth="0.5" strokeDasharray="2 3" />
        </svg>

        {/* static crosshair, and the one point of color */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
          <line x1="50" y1="40" x2="50" y2="60" stroke="hsl(0 0% 96% / 0.28)" strokeWidth="0.6" />
          <line x1="40" y1="50" x2="60" y2="50" stroke="hsl(0 0% 96% / 0.28)" strokeWidth="0.6" />
        </svg>
        <span className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-ember animate-tick" style={{ marginTop: -3, marginLeft: -3 }} />

        {/* live degree readout — the same clock driving the outer ring's
            CSS rotation, read back out as text */}
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

// A sparse, static field of faint stars so the void around the globe reads
// as space rather than empty page. Positions are randomized once per mount.
function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() < 0.2 ? 2 : 1,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [],
  );

  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-ink"
          style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}
    </div>
  );
}

