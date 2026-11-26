import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { EmberField } from "./EmberField";
import { PillLink } from "./PillLink";
import { GRAIN, rgba } from "./atmosphere";
import { PROTOCOLS_LIVE } from "./landingContent";

/**
 * Optional photographic background.
 *
 * Drop a file at `frontend/public/brand/hero.jpg` and the hero uses it as its
 * backdrop (under the same darkening overlay and bottom fade), in place of the
 * painted CSS dusk scene. Nothing ships in that path by default; we probe for
 * it at runtime so a missing file costs one 404 and nothing else.
 */
const HERO_IMAGE = "/brand/hero.jpg";

function useOptionalImage(src: string) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => setOk(img.naturalWidth > 0);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return ok;
}

/** The painted-with-CSS dusk: teal sky, rust horizon glow, olive ground. */
function DuskScene() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(60% 45% at 50% 64%, ${rgba("ember", 0.34)} 0%, ${rgba("rust", 0.75)} 28%, ${rgba("rust", 0)} 70%)`,
            `radial-gradient(55% 40% at 14% 30%, ${rgba("teal", 0.85)} 0%, ${rgba("teal", 0)} 70%)`,
            `radial-gradient(50% 38% at 88% 22%, ${rgba("olive", 0.55)} 0%, ${rgba("olive", 0)} 70%)`,
            `linear-gradient(180deg, ${rgba("teal", 0.95)} 0%, ${rgba("teal", 0.6)} 28%, ${rgba("rust", 0.5)} 52%, ${rgba("rust", 0.42)} 63%, ${rgba("olive", 0.45)} 74%, ${rgba("base", 1)} 100%)`,
          ].join(", "),
        }}
      />
      {/* The forge "sun": a huge soft disc sinking into the horizon. */}
      <div
        className="absolute left-1/2 top-[64%] aspect-square w-[min(92vw,880px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${rgba("ember", 0.42)} 0%, ${rgba("ember", 0.16)} 28%, ${rgba("rust", 0.22)} 48%, ${rgba("rust", 0)} 68%)`,
        }}
      />
      {/* Hairline orbits, the scene's quiet geometry. */}
      <svg
        className="absolute left-1/2 top-[64%] w-[min(140vw,1500px)] -translate-x-1/2 -translate-y-1/2 opacity-60"
        viewBox="0 0 1000 1000"
        fill="none"
        aria-hidden="true"
      >
        {[240, 330, 430].map((r, i) => (
          <circle
            key={r}
            cx="500"
            cy="500"
            r={r}
            stroke="url(#orbit)"
            strokeWidth={0.6}
            strokeDasharray={i === 1 ? "2 6" : undefined}
          />
        ))}
        <defs>
          <linearGradient id="orbit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.28" />
            <stop offset="0.5" stopColor="white" stopOpacity="0.08" />
            <stop offset="0.52" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {/* Horizon: a soft bright seam with a warm bloom, then the olive ground. */}
      <div
        className="absolute inset-x-0 top-[64%] h-[90px] -translate-y-1/2 blur-2xl"
        style={{
          background: `radial-gradient(45% 50% at 50% 50%, ${rgba("ember", 0.55)} 0%, ${rgba("ember", 0.12)} 55%, transparent 100%)`,
        }}
      />
      <div
        className="absolute inset-x-[8%] top-[64%] h-px opacity-70"
        style={{
          background: `linear-gradient(90deg, transparent, ${rgba("ember", 0.35)} 25%, rgb(255 214 170 / 0.55) 50%, ${rgba("ember", 0.35)} 75%, transparent)`,
        }}
      />
      <div
        className="absolute inset-x-0 top-[58%] h-[42%]"
        style={{
          background: `linear-gradient(180deg, ${rgba("olive", 0)} 0%, ${rgba("olive", 0.42)} 16%, ${rgba("olive", 0.2)} 45%, ${rgba("base", 0)} 100%)`,
        }}
      />
    </>
  );
}

export function LandingHero() {
  const hasImage = useOptionalImage(HERO_IMAGE);
  const reduce = useReducedMotion();
  const appear = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-base"
    >
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {hasImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          />
        ) : (
          <DuskScene />
        )}
        <EmberField className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
        {/* 30% black overlay keeps type legible; then fade to the canvas. */}
        <div className="absolute inset-0 bg-base/30" />
        <div
          className="absolute inset-x-0 bottom-0 h-[48%]"
          style={{ background: `linear-gradient(180deg, ${rgba("base", 0)} 0%, ${rgba("base", 0.85)} 60%, ${rgba("base", 1)} 100%)` }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col items-center justify-center px-5 pb-16 pt-32 text-center sm:px-8">
        <motion.p
          {...appear(0)}
          className="mb-6 inline-flex items-center gap-2 rounded-pill border border-glass-border bg-glass px-3.5 py-1.5 text-[13px] text-ink/90 backdrop-blur-md"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgb(255_102_0/0.9)]" aria-hidden="true" />
          The Agentic Software Engineering OS
        </motion.p>
        <motion.h1
          id="hero-title"
          {...appear(0.08)}
          className="text-balance text-[46px] font-medium leading-[1.02] tracking-[-0.04em] text-ink [text-shadow:0_2px_24px_rgb(0_0_0/0.35)] sm:text-[64px] lg:text-[80px]"
        >
          Ship ideas, autonomously.
        </motion.h1>
        <motion.p
          {...appear(0.18)}
          className="mt-5 max-w-[34rem] text-balance text-[16px] leading-[1.5] text-ink/85 sm:text-[17px]"
        >
          From imagination to autonomous execution. Forge runs a full engineering organisation of
          AI agents that plans, builds, verifies and ships, and stops for your approval where it matters.
        </motion.p>
        <motion.div {...appear(0.28)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PillLink to="/signup" variant="secondary" size="lg">
            Start building
          </PillLink>
          <a
            href="#product"
            className="inline-flex h-12 items-center gap-2 rounded-pill border border-transparent bg-ink px-6 text-[15px] font-medium text-[rgb(var(--bg))] transition-all duration-fast hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            See how it works
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
        </motion.div>
      </div>

      <div className="relative mx-auto w-full max-w-[1120px] px-5 pb-14 text-center sm:px-8">
        <p className="text-[14px] text-ink/80">Speaks the open agent protocols.</p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12">
          {PROTOCOLS_LIVE.map((p) => (
            <li key={p} className="font-mono text-[20px] tracking-[-0.02em] text-muted sm:text-[26px]">
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
