import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

// Minimal home screen: a revolving globe behind a single centered CTA.
// Pure CSS/SVG — no 3D library — kept lightweight and dependency-free.
export default function Launch() {
  const navigate = useNavigate();

  return (
    <div className="relative h-screen w-screen flex items-center justify-center overflow-hidden bg-base">
      <Globe />

      <button
        type="button"
        onClick={() => navigate("/projects")}
        className="relative z-10 w-44 h-44 rounded-full bg-accent text-white flex flex-col items-center justify-center gap-2 shadow-[0_0_80px_rgba(0,0,0,0.6)] hover:scale-105 transition-transform motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-base"
      >
        <Plus size={28} strokeWidth={1.5} aria-hidden="true" />
        <span className="font-display text-sm font-medium tracking-tight">Build with Forge</span>
      </button>
    </div>
  );
}

function Globe() {
  const parallels = [-60, -30, 0, 30, 60];
  const meridianCount = 8;

  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{ width: "min(90vh, 90vw)", height: "min(90vh, 90vw)" }}
    >
      <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_32%_28%,hsl(0_0%_20%),hsl(0_0%_5%)_72%)] border border-muted/40" />

      {/* Meridians — vertical ellipses rotating around the sphere's Y axis */}
      <div className="absolute inset-0 [transform-style:preserve-3d] animate-[spin-globe_50s_linear_infinite] motion-reduce:animate-none">
        {Array.from({ length: meridianCount }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-muted/25"
            style={{ transform: `rotateY(${(i * 180) / meridianCount}deg)` }}
          />
        ))}
      </div>

      {/* Parallels — horizontal rings for latitude lines */}
      <div className="absolute inset-0">
        {parallels.map((deg) => {
          const scale = Math.cos((deg * Math.PI) / 180);
          const offset = 50 - scale * 50;
          return (
            <div
              key={deg}
              className="absolute left-0 right-0 rounded-full border border-muted/20"
              style={{ top: `${offset}%`, height: `${scale * 100}%` }}
            />
          );
        })}
      </div>

      {/* Equator, drawn brighter as a fixed reference line */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-accent/30" />

      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,transparent_60%,hsl(0_0%_4%)_88%)]" />
    </div>
  );
}
