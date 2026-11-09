import React from "react";

interface VisualProps {
  className?: string;
  variant?: "orange" | "cyan" | "lime";
  modelName?: string;
  activeStack?: string;
}

/**
 * High-tech cyberpunk vector visualization of the Forge Autonomous Workstation / Fullstack Rig
 */
export function ForgeWorkstationVisual({
  className = "",
  variant = "orange",
  modelName = "FORGE",
  activeStack = "NEXT.JS + TAILWIND + POSTGRESQL",
}: VisualProps) {
  const accent =
    variant === "cyan" ? "#00F0FF" : variant === "lime" ? "#00F59B" : "#FF5522";

  return (
    <div className={`relative w-full flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 880 440"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="chassisGrad" x1="100" y1="80" x2="780" y2="380" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1C2128" />
            <stop offset="50%" stopColor="#0F1318" />
            <stop offset="100%" stopColor="#080A0D" />
          </linearGradient>

          <linearGradient id="screenGrad" x1="200" y1="100" x2="680" y2="320" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10151E" />
            <stop offset="100%" stopColor="#07090C" />
          </linearGradient>

          <linearGradient id="accentGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.8" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.1" />
          </linearGradient>

          <radialGradient id="deskShadow" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#000000" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Ground Shadow */}
        <ellipse cx="440" cy="410" rx="380" ry="22" fill="url(#deskShadow)" />

        {/* ================= HEAVY INDUSTRIAL CONSOLE BASE ================= */}
        <g id="workstation-base">
          {/* Main Console Chassis Body */}
          <path
            d="M 160 370 L 220 330 L 660 330 L 720 370 L 680 395 L 200 395 Z"
            fill="url(#chassisGrad)"
            stroke="#161B22"
            strokeWidth="2.5"
          />

          {/* Underbody Ventilation Heat Sinks */}
          <g transform="translate(260, 365)">
            <rect x="0" y="0" width="360" height="18" rx="2" fill="#0A0D11" stroke="#252C37" strokeWidth="1.5" />
            {[...Array(24)].map((_, i) => (
              <line key={i} x1={15 * i + 10} y1="3" x2={15 * i + 10} y2="15" stroke="#3D4756" strokeWidth="1.5" />
            ))}
          </g>

          {/* Front Billet Metallic Bezel Plate with Model Name */}
          <polygon
            points="240,335 640,335 625,355 255,355"
            fill="#E5E9F0"
            stroke="#12161D"
            strokeWidth="1.5"
          />
          <text
            x="270"
            y="350"
            fill="#0F1318"
            fontSize="12"
            fontWeight="900"
            fontFamily="monospace"
            letterSpacing="0.15em"
          >
            SYS.RIG // {modelName}.ENGINE-OS
          </text>
          <text
            x="510"
            y="350"
            fill="#FF5522"
            fontSize="10"
            fontWeight="900"
            fontFamily="monospace"
          >
            6-AGENT CORE: ACTIVE
          </text>
        </g>

        {/* ================= PRIMARY WIDESCREEN HOLOGRAPHIC DISPLAY ================= */}
        <g id="main-monitor" transform="translate(140, 60)">
          {/* Outer Monitor Frame */}
          <rect
            x="0"
            y="0"
            width="600"
            height="260"
            rx="6"
            fill="url(#screenGrad)"
            stroke="#1B222D"
            strokeWidth="3"
          />

          {/* Top Title Bar of the IDE */}
          <rect x="0" y="0" width="600" height="28" rx="6" fill="#161B22" stroke="#252D3A" strokeWidth="1" />

          {/* Window Traffic Lights & Workspace Tabs */}
          <circle cx="16" cy="14" r="4" fill="#FF5F56" />
          <circle cx="28" cy="14" r="4" fill="#FFBD2E" />
          <circle cx="40" cy="14" r="4" fill="#27C93F" />

          {/* Active Tab */}
          <rect x="65" y="4" width="160" height="24" rx="3" fill="#0D1117" stroke={accent} strokeWidth="1" />
          <text x="78" y="20" fill="#E6EDF3" fontSize="10" fontWeight="bold" fontFamily="monospace">
            /src/engine/agent_swarm.ts
          </text>

          {/* Secondary Tab */}
          <rect x="235" y="4" width="130" height="24" rx="3" fill="#141820" />
          <text x="248" y="20" fill="#8B949E" fontSize="10" fontFamily="monospace">
            /api/orchestrator.py
          </text>

          {/* Live Stack Tag */}
          <rect x="440" y="5" width="150" height="18" rx="2" fill={accent} fillOpacity="0.15" stroke={accent} strokeWidth="1" />
          <text x="448" y="18" fill={accent} fontSize="8.5" fontWeight="900" fontFamily="monospace">
            STACK: {activeStack.slice(0, 18)}
          </text>

          {/* Left Sidebar: File Tree & Agents Hierarchy */}
          <rect x="0" y="28" width="140" height="232" fill="#0B0E13" stroke="#1F2633" strokeWidth="1" />
          <text x="12" y="48" fill="#8B949E" fontSize="9" fontWeight="bold" fontFamily="monospace" letterSpacing="0.08em">
            AGENT PIPELINE
          </text>

          {/* Agent status rows */}
          {[
            { name: "ARCHITECT", status: "ONLINE", hue: "#0A84FF" },
            { name: "DEVELOPER", status: "BUILDING", hue: "#30D158" },
            { name: "QA_ENGINEER", status: "VERIFIED", hue: "#BF5AF2" },
            { name: "DEVOPS_RIG", status: "SYNCED", hue: "#FF9F0A" },
          ].map((ag, i) => (
            <g key={ag.name} transform={`translate(10, ${64 + i * 26})`}>
              <circle cx="5" cy="5" r="3.5" fill={ag.hue} />
              <text x="16" y="8" fill="#E6EDF3" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                {ag.name}
              </text>
              <rect x="75" y="0" width="45" height="12" rx="2" fill="#161B22" />
              <text x="80" y="9" fill={ag.hue} fontSize="7" fontWeight="bold" fontFamily="monospace">
                {ag.status}
              </text>
            </g>
          ))}

          {/* AST / Component Mini Visual in sidebar */}
          <g transform="translate(12, 178)">
            <rect x="0" y="0" width="116" height="42" rx="3" fill="#131720" stroke="#252D3A" strokeWidth="1" />
            <text x="8" y="14" fill="#8B949E" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
              AST FLOW GRAPH
            </text>
            <path d="M 12 28 L 36 28 L 54 20 L 76 20 L 94 32" stroke={accent} strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="28" r="2.5" fill="#E6EDF3" />
            <circle cx="54" cy="20" r="2.5" fill={accent} />
            <circle cx="94" cy="32" r="2.5" fill="#30D158" />
          </g>

          {/* Center Area: Code Synthesizer Editor */}
          <g transform="translate(148, 36)">
            {/* Syntax Highlight Lines */}
            <text x="0" y="16" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              import
            </text>
            <text x="42" y="16" fill="#79C0FF" fontSize="9" fontFamily="monospace">
              &#123; createAutonomousOrchestrator &#125;
            </text>
            <text x="240" y="16" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              from
            </text>
            <text x="272" y="16" fill="#A5D6FF" fontSize="9" fontFamily="monospace">
              "@forge/core"
            </text>

            <text x="0" y="34" fill="#79C0FF" fontSize="9" fontFamily="monospace">
              export async function
            </text>
            <text x="145" y="34" fill="#D2A8FF" fontSize="9" fontFamily="monospace">
              executeFullstackBuild
            </text>
            <text x="280" y="34" fill="#E6EDF3" fontSize="9" fontFamily="monospace">
              (spec: AppSpec) &#123;
            </text>

            <text x="16" y="52" fill="#8B949E" fontSize="8.5" fontFamily="monospace">
              // 1. Decompose PRD into technical architecture & epics
            </text>
            <text x="16" y="68" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              const
            </text>
            <text x="50" y="68" fill="#FFA657" fontSize="9" fontFamily="monospace">
              plan
            </text>
            <text x="80" y="68" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              =
            </text>
            <text x="94" y="68" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              await
            </text>
            <text x="135" y="68" fill="#79C0FF" fontSize="9" fontFamily="monospace">
              architect.synthesize
            </text>
            <text x="250" y="68" fill="#E6EDF3" fontSize="9" fontFamily="monospace">
              (spec.prompt);
            </text>

            <text x="16" y="86" fill="#8B949E" fontSize="8.5" fontFamily="monospace">
              // 2. Parallel agent code generation with deterministic lint
            </text>
            <text x="16" y="102" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              const
            </text>
            <text x="50" y="102" fill="#FFA657" fontSize="9" fontFamily="monospace">
              repo
            </text>
            <text x="80" y="102" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              =
            </text>
            <text x="94" y="102" fill="#FF7B72" fontSize="9" fontFamily="monospace">
              await
            </text>
            <text x="135" y="102" fill="#79C0FF" fontSize="9" fontFamily="monospace">
              developer.buildApplication
            </text>
            <text x="290" y="102" fill="#E6EDF3" fontSize="9" fontFamily="monospace">
              (plan.modules);
            </text>

            <text x="16" y="120" fill="#7EE787" fontSize="9" fontFamily="monospace">
              return
            </text>
            <text x="60" y="120" fill="#E6EDF3" fontSize="9" fontFamily="monospace">
              &#123; status: "DEPLOYED", liveUrl: repo.previewEndpoint &#125;;
            </text>
            <text x="0" y="136" fill="#E6EDF3" fontSize="9" fontFamily="monospace">
              &#125;
            </text>
          </g>

          {/* Bottom Terminal Output Tray */}
          <g transform="translate(148, 180)">
            <rect x="0" y="0" width="440" height="72" rx="3" fill="#0A0D12" stroke="#1F2633" strokeWidth="1" />
            <rect x="0" y="0" width="440" height="18" fill="#131720" />
            <text x="8" y="13" fill="#8B949E" fontSize="8" fontWeight="bold" fontFamily="monospace">
              LIVE AGENT TELEMETRY TERMINAL [PORT: 3000]
            </text>
            <circle cx="424" cy="9" r="3" fill="#27C93F" />

            <text x="8" y="33" fill="#58A6FF" fontSize="8" fontFamily="monospace">
              [ARCHITECT]
            </text>
            <text x="85" y="33" fill="#8B949E" fontSize="8" fontFamily="monospace">
              Design tokens resolved • 12-column responsive layout created
            </text>

            <text x="8" y="47" fill="#3FB950" fontSize="8" fontFamily="monospace">
              [DEVELOPER]
            </text>
            <text x="85" y="47" fill="#8B949E" fontSize="8" fontFamily="monospace">
              Synthesized 14 files • Tailwind v4 compiled in 1.4s
            </text>

            <text x="8" y="61" fill={accent} fontSize="8" fontFamily="monospace">
              [QA_SUITE]
            </text>
            <text x="85" y="61" fill="#E6EDF3" fontSize="8" fontWeight="bold" fontFamily="monospace">
              PASS: 42/42 E2E Tests • WCAG AA compliant • 0 warnings
            </text>
          </g>
        </g>

        {/* Decorative Sci-Fi Cyberpunk Cable Bus Lines */}
        <path
          d="M 120 385 C 100 385, 60 360, 60 320 L 60 220 C 60 180, 100 160, 138 160"
          stroke={accent}
          strokeWidth="2.5"
          strokeDasharray="8 4"
          fill="none"
          opacity="0.8"
        />
        <circle cx="138" cy="160" r="4" fill={accent} />

        <path
          d="M 760 385 C 790 385, 820 360, 820 320 L 820 220 C 820 180, 780 160, 742 160"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeDasharray="6 3"
          fill="none"
          opacity="0.6"
        />
        <circle cx="742" cy="160" r="3.5" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

/**
 * Cyberpunk visualization for Card 002: Autonomous Agent Swarm & Neural Pipeline Topology
 */
export function ForgeSwarmVisual({
  className = "",
  variant = "orange",
}: VisualProps) {
  const accent =
    variant === "cyan" ? "#00F0FF" : variant === "lime" ? "#00F59B" : "#FF5522";

  return (
    <div className={`relative w-full h-full flex items-center justify-center select-none overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 420 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <radialGradient id="reactorGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
            <stop offset="70%" stopColor={accent} stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Neural Core Glow */}
        <circle cx="210" cy="180" r="140" fill="url(#reactorGlow)" />

        {/* Outer Circular High-Tech Compass / Reticle Grid */}
        <circle cx="210" cy="180" r="130" stroke="#252D3A" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="210" cy="180" r="95" stroke="#333D4D" strokeWidth="1" />
        <circle cx="210" cy="180" r="55" stroke={accent} strokeWidth="2" strokeDasharray="24 8" />

        {/* Crosshair Axes */}
        <line x1="210" y1="30" x2="210" y2="330" stroke="#1F2633" strokeWidth="1.5" />
        <line x1="60" y1="180" x2="360" y2="180" stroke="#1F2633" strokeWidth="1.5" />

        {/* Central Orchestrator Core Reactor */}
        <circle cx="210" cy="180" r="32" fill="#121720" stroke="#3D495C" strokeWidth="2" />
        <circle cx="210" cy="180" r="22" fill="#0A0D12" stroke={accent} strokeWidth="2" />
        <circle cx="210" cy="180" r="8" fill="#FFFFFF" />
        <text
          x="210"
          y="184"
          fill={accent}
          fontSize="7"
          fontWeight="900"
          fontFamily="monospace"
          textAnchor="middle"
        >
          CORE
        </text>

        {/* Connected Agent Satellite Pods */}
        {[
          { angle: -120, label: "ARCH", sub: "L4", color: "#0A84FF" },
          { angle: -60, label: "DEV", sub: "L5", color: "#30D158" },
          { angle: 0, label: "QA", sub: "L4", color: "#BF5AF2" },
          { angle: 60, label: "OPS", sub: "L5", color: "#FF9F0A" },
          { angle: 120, label: "PM", sub: "L3", color: "#64D2FF" },
          { angle: 180, label: "SEC", sub: "L5", color: "#FF5522" },
        ].map((node) => {
          const rad = (node.angle * Math.PI) / 180;
          const x = 210 + Math.cos(rad) * 95;
          const y = 180 + Math.sin(rad) * 95;

          return (
            <g key={node.label}>
              {/* Bus trace line to core */}
              <line
                x1="210"
                y1="180"
                x2={x}
                y2={y}
                stroke={node.color}
                strokeWidth="2"
                strokeOpacity="0.75"
              />
              {/* Satellite Node Box */}
              <rect
                x={x - 18}
                y={y - 12}
                width="36"
                height="24"
                rx="3"
                fill="#161C24"
                stroke={node.color}
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y - 1}
                fill="#E6EDF3"
                fontSize="8"
                fontWeight="900"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {node.label}
              </text>
              <text
                x={x}
                y={y + 8}
                fill={node.color}
                fontSize="6"
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {node.sub}
              </text>
            </g>
          );
        })}

        {/* Floating Telemetry Coordinates */}
        <text x="75" y="60" fill="#8B949E" fontSize="8" fontFamily="monospace">
          NODE.SWARM // ACTIVE: 6
        </text>
        <text x="75" y="72" fill="#3FB950" fontSize="7" fontWeight="bold" fontFamily="monospace">
          DETERMINISTIC PIPELINE: LOCKED
        </text>

        <text x="270" y="310" fill="#8B949E" fontSize="8" fontFamily="monospace">
          LATENCY: 14ms
        </text>
        <text x="270" y="322" fill={accent} fontSize="7" fontWeight="bold" fontFamily="monospace">
          THROUGHPUT: 4.8x
        </text>
      </svg>
    </div>
  );
}
