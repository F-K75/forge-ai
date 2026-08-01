import { useEffect, useRef } from "react";
import Globe from "three-globe";
import type { Agent } from "../lib/agents";

const AGENT_COLORS: Record<Agent["id"], [number, number, number]> = {
  architect: [0.039, 0.518, 1.0],
  business_improver: [0.369, 0.361, 0.902],
  designer: [0.749, 0.353, 0.949],
  developer: [0.188, 0.820, 0.345],
  integration: [0.392, 0.824, 1.0],
  pm: [1.0, 0.624, 0.039],
};

type AgentColorId = keyof typeof AGENT_COLORS;

interface Globe3DProps {
  activeAgentId?: AgentColorId;
}

const HUBS: [number, number][] = [
  [37.77, -122.41],
  [40.71, -74.0],
  [51.5, -0.12],
  [52.52, 13.4],
  [19.07, 72.87],
  [12.97, 77.59],
  [35.68, 139.69],
  [1.35, 103.82],
  [-23.55, -46.63],
  [-33.87, 151.21],
];

export default function Globe3D({ activeAgentId = "architect" }: Globe3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<Globe | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const globe = new Globe(containerRef.current, {
      waitForGlobeReady: true,
      animateIn: true,
      autoRotate: true,
      autoRotateSpeed: 0.6,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    globe
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
      .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
      .pointsData(HUBS.map((location) => ({ lat: location[0], lng: location[1] })))
      .pointColor(() => "#14B8A6")
      .pointAltitude(0.02)
      .pointRadius(0.4)
      .arcsData([])
      .arcColor(() => "#14B8A6")
      .arcStroke(0.2)
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(1800);

    globeRef.current = globe;

    const onResize = () => {
      if (!containerRef.current) return;
      globe.width(containerRef.current.clientWidth);
      globe.height(containerRef.current.clientHeight);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const color = AGENT_COLORS[activeAgentId] ?? AGENT_COLORS.architect;
    const rgb = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
    globeRef.current?.pointColor(() => rgb).arcColor(() => rgb);
  }, [activeAgentId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.9 }}
    />
  );
}
