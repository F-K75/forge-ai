import { useEffect, useRef } from "react";

export default function GlobalBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none" aria-hidden="true">
      {/* Retro desktop base color & crisp dot grid */}
      <div className="absolute inset-0 bg-[#EAE6DF] dark:bg-[#0F1014] transition-colors duration-150" />
      <div
        className="absolute inset-0 opacity-40 dark:opacity-25"
        style={{
          backgroundImage: "radial-gradient(#000000 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}
      />
      {/* Subtle retro screen corner vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.06)_100%)] dark:bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
