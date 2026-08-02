import { useEffect, useRef } from "react";

const DOT_RADIUS = 1;
const DOT_SPACING = 28;
const DOT_COLOR = "rgba(255, 255, 255, 0.12)";
const DOT_COLOR_LIGHT = "rgba(20, 184, 166, 0.35)";
const GLOW_RADIUS = 320;
const BG_COLOR = "rgb(var(--bg))";

export default function GlobalBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseLeave = () => {
      mouseRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

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
              const radius = DOT_RADIUS + intensity * 1.5;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fillStyle = DOT_COLOR_LIGHT;
              ctx.globalAlpha = 0.15 + intensity * 0.6;
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

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 0 }}
    />
  );
}
