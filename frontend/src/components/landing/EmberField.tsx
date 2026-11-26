import { useEffect, useRef } from "react";
import { HUE } from "./atmosphere";

interface Spark {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  phase: number;
  life: number;
  max: number;
  warm: number;
}

/**
 * A slow field of embers drifting up from the hero's horizon, drawn on a
 * 2D canvas. Under prefers-reduced-motion it paints a single still frame.
 * Rendering pauses while the canvas is off-screen or the tab is hidden.
 */
export function EmberField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const g = ctx;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const [er, eg, eb] = HUE.ember.split(" ").map(Number);

    let w = 0;
    let h = 0;
    let sparks: Spark[] = [];
    let raf = 0;
    let visible = true;

    const spawn = (initial: boolean): Spark => {
      const max = 9 + Math.random() * 14;
      return {
        x: Math.random() * w,
        // Rise from the lower half (the "horizon"); seed some mid-flight.
        y: initial ? h * (0.25 + Math.random() * 0.8) : h * (0.78 + Math.random() * 0.3),
        r: 0.5 + Math.random() * 1.5,
        vy: 8 + Math.random() * 22,
        sway: 6 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        life: initial ? Math.random() * max : 0,
        max,
        warm: Math.random(),
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, Math.max(36, w / 13)));
      sparks = Array.from({ length: count }, () => spawn(true));
    };

    const draw = () => {
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (const s of sparks) {
        const t = s.life / s.max;
        // Fade in, glow, fade out. Brighter near the horizon.
        const env = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
        const height = 1 - s.y / h;
        const a = env * (0.55 - height * 0.35);
        if (a <= 0.01) continue;
        const x = s.x + Math.sin(s.phase + s.life * 0.6) * s.sway;
        const gg = Math.round(eg + (200 - eg) * s.warm * 0.6);
        const bb = Math.round(eb + 90 * s.warm * 0.4);
        const grad = g.createRadialGradient(x, s.y, 0, x, s.y, s.r * 6);
        grad.addColorStop(0, `rgba(${er},${gg},${bb},${a})`);
        grad.addColorStop(0.25, `rgba(${er},${gg},${bb},${a * 0.35})`);
        grad.addColorStop(1, `rgba(${er},${gg},${bb},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, s.y, s.r * 6, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
    };

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.life += dt;
        s.y -= s.vy * dt;
        if (s.life >= s.max || s.y < -10) sparks[i] = spawn(false);
      }
      draw();
      if (visible) raf = requestAnimationFrame(tick);
    };

    resize();
    draw();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      resize();
      draw();
    }) : null;
    ro?.observe(canvas);

    if (reduce) return () => ro?.disconnect();

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting && !document.hidden;
            if (visible) start();
          })
        : null;
    io?.observe(canvas);
    const onVis = () => {
      visible = !document.hidden;
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
