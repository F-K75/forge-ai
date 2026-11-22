import ForgeScene3D from "./three/ForgeScene3D";
import type { StudioFinish } from "./three/proceduralModels";

interface VisualProps {
  className?: string;
  finish?: StudioFinish;
  showControls?: boolean;
}

/**
 * Interactive 3D Autonomous Core Workstation visual (replaces legacy static cyberpunk SVG).
 */
export function ForgeWorkstationVisual({
  className = "",
  finish = "obsidian",
  showControls = true,
}: VisualProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-border bg-[#0B101B] ${className}`}
    >
      <ForgeScene3D
        mode="embedded"
        initialFinish={finish}
        initialPreset="overview"
        showControls={showControls}
      />
    </div>
  );
}

/**
 * Interactive 3D Multi-Agent Orbital Topology visual.
 */
export function ForgeSwarmVisual({
  className = "",
  finish = "blueprint",
  showControls = true,
}: VisualProps) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-border bg-[#0B101B] ${className}`}
    >
      <ForgeScene3D
        mode="embedded"
        initialFinish={finish}
        initialPreset="orbit"
        showControls={showControls}
      />
    </div>
  );
}

export default ForgeWorkstationVisual;
