import { useEffect, useRef } from "react";

const DOT_RADIUS = 1;
const DOT_SPACING = 20;
const DOT_COLOR = "rgba(255, 255, 255, 0.14)";
const DOT_COLOR_LIGHT = "rgba(20, 184, 166, 0.55)";
const GLOW_RADIUS = 420;

export default function GlobalBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseLeave = () => {
      mouseRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    const draw = () => {
      const { left, top, width, height } = container.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / DOT_SPACING) + 1;
      const rows = Math.ceil(height / DOT_SPACING) + 1;
      const offsetX = (width - (cols - 1) * DOT_SPACING) / 2;
      const offsetY = (height - (rows - 1) * DOT_SPACING) / 2;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = offsetX + i * DOT_SPACING;
          const y = offsetY + j * DOT_SPACING;

          if (mouseRef.current) {
            const dx = x - mouseRef.current.x;
            const dy = y - mouseRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < GLOW_RADIUS) {
              const intensity = 1 - distance / GLOW_RADIUS;
              const radius = DOT_RADIUS + intensity * 2.8;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fillStyle = DOT_COLOR_LIGHT;
              ctx.globalAlpha = 0.25 + intensity * 0.75;
              ctx.fill();
              ctx.globalAlpha = 1;
              continue;
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = DOT_COLOR;
          ctx.fill();
        }
      }

      const existing = container.querySelector("canvas.global-bg-canvas");
      if (existing) existing.remove();
      canvas.className = "global-bg-canvas pointer-events-none absolute inset-0 h-full w-full";
      container.appendChild(canvas);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(rafRef.current);
      const canvas = container.querySelector("canvas.global-bg-canvas");
      if (canvas) canvas.remove();
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className="absolute inset-0 h-full w-full overflow-hidden" />;
}
