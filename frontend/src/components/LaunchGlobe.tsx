import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";
import { AGENTS } from "../lib/agents";

// WebGL earth for the Launch splash, rendered with cobe (~5 kB): dotted
// continents, atmosphere glow, city markers tinted with the agent palette,
// and arcs suggesting builds shipping across the network. Drag to spin.
// Falls back to the original CSS wireframe globe when WebGL is unavailable.

type Vec3 = [number, number, number];

const hex01 = (hex: string): Vec3 => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const ACCENT: Vec3 = hex01("#7C5CFF");
const AGENT_COLORS = AGENTS.map((a) => hex01(a.hue));

// Rough build hubs — [lat, lon] — cycled through the agent palette.
const HUBS: [number, number][] = [
  [37.77, -122.41], // San Francisco
  [40.71, -74.0], // New York
  [51.5, -0.12], // London
  [52.52, 13.4], // Berlin
  [19.07, 72.87], // Mumbai
  [12.97, 77.59], // Bengaluru
  [35.68, 139.69], // Tokyo
  [1.35, 103.82], // Singapore
  [-23.55, -46.63], // São Paulo
  [-33.87, 151.21], // Sydney
];

const MARKERS = HUBS.map((location, i) => ({
  location,
  size: i % 3 === 0 ? 0.035 : 0.022,
  color: AGENT_COLORS[i % AGENT_COLORS.length],
}));

const ARCS = [
  { from: HUBS[0], to: HUBS[2] }, // SF → London
  { from: HUBS[2], to: HUBS[5] }, // London → Bengaluru
  { from: HUBS[5], to: HUBS[6] }, // Bengaluru → Tokyo
  { from: HUBS[6], to: HUBS[9] }, // Tokyo → Sydney
  { from: HUBS[1], to: HUBS[8] }, // New York → São Paulo
  { from: HUBS[4], to: HUBS[3] }, // Mumbai → Berlin
];

const supportsWebGL = () => {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
};

export default function LaunchGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  // Horizontal drag state: null when idle, pointer x-origin while dragging.
  const pointerStart = useRef<number | null>(null);
  const dragOffset = useRef(0);
  const dragBase = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!supportsWebGL()) {
      setFallback(true);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = canvas.offsetWidth;
    const onResize = () => {
      width = canvas.offsetWidth;
      globe.update({ width: width * 2, height: width * 2 });
    };

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.22,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 22000,
      mapBrightness: 4.2,
      mapBaseBrightness: 0.04,
      baseColor: [0.32, 0.32, 0.42],
      markerColor: ACCENT,
      glowColor: [0.16, 0.12, 0.32],
      arcColor: [0.4, 0.3, 0.78],
      arcWidth: 0.5,
      arcHeight: 0.22,
      opacity: 0.9,
      markers: MARKERS,
      arcs: ARCS,
    });

    window.addEventListener("resize", onResize);

    // cobe v2 renders a single frame per update(); the spin is ours to drive.
    let phi = 4.5; // start on the Asia/Europe side so markers are visible
    let raf = 0;
    const frame = () => {
      if (!reduced && pointerStart.current === null) phi += 0.0025;
      globe.update({ phi: phi + dragOffset.current });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Fade the canvas in once the first frames have drawn.
    const fadeTimer = window.setTimeout(() => {
      canvas.style.opacity = "1";
    }, 80);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fadeTimer);
      window.removeEventListener("resize", onResize);
      globe.destroy();
    };
  }, []);

  if (fallback) return <CssGlobe />;

  return (
    <div
      aria-hidden="true"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: "min(92vh, 92vw)", height: "min(92vh, 92vw)" }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full opacity-0 transition-opacity duration-1000 cursor-grab active:cursor-grabbing"
        style={{ contain: "layout paint size", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          pointerStart.current = e.clientX;
          dragBase.current = dragOffset.current;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (pointerStart.current === null) return;
          dragOffset.current = dragBase.current + (e.clientX - pointerStart.current) / 180;
        }}
        onPointerUp={() => {
          pointerStart.current = null;
        }}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
      />
      {/* Vignette so the overlaid wordmark and prompt stay readable */}
      <div className="absolute inset-0 rounded-full pointer-events-none bg-[radial-gradient(circle_at_50%_50%,hsl(0_0%_4%/0.72)_0%,hsl(0_0%_4%/0.4)_36%,transparent_55%)]" />
    </div>
  );
}

// Original dependency-free wireframe globe, kept as the no-WebGL fallback.
function CssGlobe() {
  const parallels = [-60, -30, 0, 30, 60];
  const meridianCount = 8;

  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: "min(92vh, 92vw)", height: "min(92vh, 92vw)" }}
    >
      <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_32%_28%,hsl(0_0%_16%),hsl(0_0%_4%)_72%)] border border-muted/30" />

      <div className="absolute inset-0 [transform-style:preserve-3d] animate-[spin-globe_50s_linear_infinite] motion-reduce:animate-none">
        {Array.from({ length: meridianCount }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-muted/20"
            style={{ transform: `rotateY(${(i * 180) / meridianCount}deg)` }}
          />
        ))}
      </div>

      <div className="absolute inset-0">
        {parallels.map((deg) => {
          const scale = Math.cos((deg * Math.PI) / 180);
          const offset = 50 - scale * 50;
          return (
            <div
              key={deg}
              className="absolute left-0 right-0 rounded-full border border-muted/15"
              style={{ top: `${offset}%`, height: `${scale * 100}%` }}
            />
          );
        })}
      </div>

      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-accent/25" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,hsl(0_0%_4%/0.55)_0%,transparent_45%,hsl(0_0%_4%)_88%)]" />
    </div>
  );
}
