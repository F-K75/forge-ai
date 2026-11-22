import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { SlidersHorizontal, Eye, EyeOff, RotateCcw, Layers, X } from "lucide-react";
import {
  afterDraw,
  createStudioFloorTexture,
  detectSoftwareGl,
  disposeObject3D,
} from "./sceneUtils";
import {
  createForgeCoreRig,
  FORGE_AGENT_SPECS,
  type AgentNodeSpec,
  type ForgeRigHandles,
  type StudioFinish,
} from "./proceduralModels";

export type CameraPreset = "overview" | "core" | "schematic" | "orbit";

export interface ForgeScene3DProps {
  mode?: "fullscreen" | "embedded";
  initialFinish?: StudioFinish;
  initialPreset?: CameraPreset;
  activeAgentId?: string | null;
  onSelectAgent?: (agent: AgentNodeSpec | null) => void;
  showControls?: boolean;
  className?: string;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { label: "Overview", pos: [5.4, 3.6, 5.8], target: [0, 1.75, 0] },
  core: { label: "Core Close-Up", pos: [2.6, 2.3, 2.9], target: [0, 2.02, 0] },
  schematic: { label: "Top Schematic", pos: [0.01, 7.6, 2.2], target: [0, 1.4, 0] },
  orbit: { label: "Agent Ring", pos: [-4.6, 2.5, 4.4], target: [0, 1.95, 0] },
};

const FINISH_OPTIONS: { id: StudioFinish; label: string; swatch: string }[] = [
  { id: "obsidian", label: "Anodized Obsidian", swatch: "#1E293B" },
  { id: "titanium", label: "Machined Titanium", swatch: "#CBD5E1" },
  { id: "blueprint", label: "Cobalt Blueprint", swatch: "#2563EB" },
];

// Pre-allocated scratch math objects (zero allocations inside RAF)
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _pointer = new THREE.Vector2();

export function ForgeScene3D({
  mode = "embedded",
  initialFinish = "obsidian",
  initialPreset = "overview",
  activeAgentId,
  onSelectAgent,
  showControls = true,
  className = "",
}: ForgeScene3DProps) {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<ForgeRigHandles | null>(null);
  const presetTargetRef = useRef<{
    active: boolean;
    pos: [number, number, number];
    target: [number, number, number];
  }>({
    active: false,
    pos: CAMERA_PRESETS[initialPreset].pos,
    target: CAMERA_PRESETS[initialPreset].target,
  });

  const [finish, setFinish] = useState<StudioFinish>(initialFinish);
  const [preset, setPreset] = useState<CameraPreset>(initialPreset);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [dockOpen, setDockOpen] = useState(mode === "fullscreen");
  const [selectedAgent, setSelectedAgent] = useState<AgentNodeSpec | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Refs synced into the Three.js loop so WebGLRenderer never re-inits on UI state changes
  const explodeRef = useRef(explode);
  const autoRotateRef = useRef(autoRotate);
  const selectedAgentRef = useRef<string | null>(activeAgentId ?? null);
  const hoveredAgentRef = useRef<string | null>(null);
  const onSelectAgentRef = useRef(onSelectAgent);

  explodeRef.current = explode;
  autoRotateRef.current = autoRotate;
  onSelectAgentRef.current = onSelectAgent;

  useEffect(() => {
    if (activeAgentId !== undefined) {
      selectedAgentRef.current = activeAgentId;
      const found = FORGE_AGENT_SPECS.find((a) => a.id === activeAgentId) || null;
      setSelectedAgent(found);
    }
  }, [activeAgentId]);

  useEffect(() => {
    setFinish(initialFinish);
  }, [initialFinish]);

  useEffect(() => {
    rigRef.current?.applyFinish(finish);
  }, [finish]);

  useEffect(() => {
    const spec = CAMERA_PRESETS[preset];
    presetTargetRef.current = { active: true, pos: spec.pos, target: spec.target };
  }, [preset]);

  // Keyboard shortcut: 'H' toggles HUD dock cleanly
  useEffect(() => {
    if (!showControls) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "h") {
        setDockOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showControls]);

  // Initialize Three.js scene once in an isolated mount div
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const isDarkTheme = document.documentElement.classList.contains("dark");
    const bgHex = isDarkTheme ? 0x0b101b : 0xeff3f8;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch {
      setContextLost(true);
      return;
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDarkTheme ? 1.1 : 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.048);

    // Studio IBL via RoomEnvironment on EVERY device (critical for realistic metals)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = isDarkTheme ? 0.9 : 0.85;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    const initCam = CAMERA_PRESETS[initialPreset];
    camera.position.set(...initCam.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(...initCam.target);
    controls.minDistance = 2.6;
    controls.maxDistance = 12.5;
    controls.minPolarAngle = 0.22;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.enablePan = false;
    controls.update();

    // Cancel any scripted camera transition immediately when the user grabs controls
    const handleControlsStart = () => {
      presetTargetRef.current.active = false;
    };
    controls.addEventListener("start", handleControlsStart);

    // Studio 3-point lighting: Warm directional key + Cool hemisphere fill + Cobalt rim
    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.3);
    keyLight.position.set(5.5, 8.2, 5.0);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 22;
      keyLight.shadow.camera.left = -5;
      keyLight.shadow.camera.right = 5;
      keyLight.shadow.camera.top = 5;
      keyLight.shadow.camera.bottom = -5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, isDarkTheme ? 0x0f172a : 0x94a3b8, 0.9);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.05);
    rimLight.position.set(-5.0, 4.0, -5.5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xe0f2fe, 2.2, 5.5, 2.5);
      softbox.position.set(-3.2, 4.8, 3.8);
      softbox.lookAt(0, 1.8, 0);
      scene.add(softbox);
    }

    // Precision architectural calibration floor blending into horizon fog
    const floorTex = createStudioFloorTexture(isDarkTheme, renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(22, 64),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: isDarkTheme ? 0.65 : 0.72,
        metalness: isDarkTheme ? 0.25 : 0.08,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    // Mount composite procedural Forge Autonomous Core Rig
    const rig = createForgeCoreRig(isSoftwareGl, initialFinish);
    rigRef.current = rig;
    scene.add(rig.root);

    // Raycaster targeting dedicated layer-1 agent hit proxies
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);

    let lastPointerCheck = 0;
    const pickAgent = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointer, camera);
      const hits = raycaster.intersectObjects(rig.hitProxies, false);
      if (hits.length > 0) {
        return (hits[0].object.userData.agentId as string) || null;
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastPointerCheck < 50) return;
      lastPointerCheck = now;
      const hitId = pickAgent(e.clientX, e.clientY);
      if (hitId !== hoveredAgentRef.current) {
        hoveredAgentRef.current = hitId;
        setHoveredAgentId(hitId);
        renderer.domElement.style.cursor = hitId ? "pointer" : "grab";
      }
    };

    let pointerDownPos = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // Dragging camera, not clicking
      const hitId = pickAgent(e.clientX, e.clientY);
      selectedAgentRef.current = hitId;
      const spec = hitId ? FORGE_AGENT_SPECS.find((a) => a.id === hitId) || null : null;
      setSelectedAgent(spec);
      onSelectAgentRef.current?.(spec);
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    // ResizeObserver cleanly tracks container dimension changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(Math.floor(entry.contentRect.width), 1);
        const h = Math.max(Math.floor(entry.contentRect.height), 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      }
    });
    resizeObserver.observe(container);

    // Smooth animation loop with dt clamp + software WebGL fenceSync pacing
    let disposed = false;
    let rafId: number | null = null;
    let cancelAfterDraw: (() => void) | null = null;
    let prevTime = performance.now();
    let elapsed = 0;
    let currentExplode = 0;

    const tick = () => {
      if (disposed) return;

      if (document.hidden) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;
      elapsed += dt;

      // Damped exploded-view separation
      currentExplode = THREE.MathUtils.damp(currentExplode, explodeRef.current, 6, dt);
      rig.radiatorGroup.position.y = currentExplode * 0.45;
      rig.coreGroup.position.y = 2.02 + currentExplode * 1.15;
      rig.innerGimbal.position.y = 2.02 + currentExplode * 0.9;
      rig.outerGimbal.position.y = 2.02 + currentExplode * 0.65;
      rig.agentOrbitGroup.position.y = currentExplode * 0.35;

      // Continuous kinetic motion
      const spinFactor = autoRotateRef.current ? 1 : 0.18;
      rig.coreGroup.rotation.y += dt * 0.45 * spinFactor;
      rig.coreGroup.rotation.x = Math.sin(elapsed * 0.7) * 0.08;
      rig.innerGimbal.rotation.x += dt * 0.38 * spinFactor;
      rig.innerGimbal.rotation.y -= dt * 0.25 * spinFactor;
      rig.outerGimbal.rotation.y += dt * 0.22 * spinFactor;
      rig.outerGimbal.rotation.z = Math.sin(elapsed * 0.45) * 0.22;
      rig.agentOrbitGroup.rotation.y += dt * 0.16 * spinFactor;

      // Highlight hovered/selected specialist agent nodes
      for (const spec of FORGE_AGENT_SPECS) {
        const group = rig.agentGroups.get(spec.id);
        const mat = rig.agentEmissiveMaterials.get(spec.id);
        if (!group || !mat) continue;
        const isHighlighted =
          selectedAgentRef.current === spec.id || hoveredAgentRef.current === spec.id;
        const targetScale = isHighlighted ? 1.24 : 1.0;
        const nextScale = THREE.MathUtils.damp(group.scale.x, targetScale, 8, dt);
        group.scale.setScalar(nextScale);
        const targetEmissive = isHighlighted ? 1.85 : 0.75;
        mat.emissiveIntensity = THREE.MathUtils.damp(mat.emissiveIntensity, targetEmissive, 8, dt);

        // Subtle radial expansion on explode
        const radialScale = 1 + currentExplode * 0.28;
        group.position.set(
          Math.cos(spec.phase) * spec.orbitRadius * radialScale,
          spec.orbitHeight + Math.sin(elapsed * 1.4 + spec.phase) * 0.04,
          Math.sin(spec.phase) * spec.orbitRadius * radialScale
        );
      }

      // Smooth camera preset transition (cancelled instantly on user orbit drag)
      if (presetTargetRef.current.active) {
        _targetPos.set(...presetTargetRef.current.pos);
        _targetLook.set(...presetTargetRef.current.target);
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(_targetPos, alpha);
        controls.target.lerp(_targetLook, alpha);
        if (
          camera.position.distanceTo(_targetPos) < 0.02 &&
          controls.target.distanceTo(_targetLook) < 0.02
        ) {
          presetTargetRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        cancelAfterDraw = afterDraw(renderer, tick);
      } else {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (cancelAfterDraw) cancelAfterDraw();
      resizeObserver.disconnect();
      controls.removeEventListener("start", handleControlsStart);
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      envTarget.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      rigRef.current = null;
    };
    // Mount WebGLRenderer exactly once per component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetView = () => {
    setPreset("overview");
    setExplode(0);
    setSelectedAgent(null);
    selectedAgentRef.current = null;
    onSelectAgent?.(null);
    presetTargetRef.current = {
      active: true,
      pos: CAMERA_PRESETS.overview.pos,
      target: CAMERA_PRESETS.overview.target,
    };
  };

  return (
    <div
      className={`relative w-full overflow-hidden select-none bg-[#0B101B] ${
        mode === "fullscreen" ? "h-[calc(100vh-56px)] min-h-[540px]" : "h-full min-h-[340px]"
      } ${className}`}
    >
      {/* Dedicated empty mount div — Three.js owns its child canvas exclusively */}
      <div ref={canvasMountRef} className="absolute inset-0" aria-label="Interactive 3D Forge Multi-Agent Core" />

      {/* Graceful fallback if WebGL context is unavailable */}
      {contextLost && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0B101B] p-6 text-center text-slate-100">
          <p className="font-display text-lg font-semibold">3D Viewport Paused</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            WebGL graphics context is unavailable or was reclaimed by the browser.
          </p>
        </div>
      )}

      {/* Top-left minimal viewport metadata (solid/rgba surface — zero backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2">
        <div className="rounded-md border border-slate-700/80 bg-[#0F172A]/90 px-3 py-1.5 text-xs text-slate-200">
          <span className="font-display font-semibold tracking-tight text-white">Forge Core Rig</span>
          <span className="mx-2 text-slate-500">·</span>
          <span className="font-mono text-[11px] text-slate-300">
            {hoveredAgentId
              ? `Inspect ${FORGE_AGENT_SPECS.find((a) => a.id === hoveredAgentId)?.name}`
              : "Drag to orbit · Click any node"}
          </span>
        </div>
      </div>

      {/* Selected Agent Telemetry Card (top-right, clean solid surface) */}
      {selectedAgent && (
        <div className="absolute right-4 top-4 z-10 w-72 rounded-lg border border-slate-700/90 bg-[#0F172A]/95 p-4 text-slate-100 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: selectedAgent.colorHex }}
                />
                <h3 className="font-display text-sm font-semibold text-white">
                  {selectedAgent.name} Agent
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{selectedAgent.role}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedAgent(null);
                selectedAgentRef.current = null;
                onSelectAgent?.(null);
              }}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Close agent details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{selectedAgent.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 font-mono text-xs tabular-nums">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">Avg Latency</span>
              <span className="text-slate-100">{selectedAgent.latencyMs} ms</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">Tasks Verified</span>
              <span className="text-slate-100">{selectedAgent.tasksCompleted}</span>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Bottom Control Dock (solid/rgba surface — zero backdrop-filter over WebGL) */}
      {showControls && (
        <div className="absolute bottom-4 left-1/2 z-10 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-col items-center gap-2">
          {dockOpen ? (
            <div className="w-full rounded-lg border border-slate-700/90 bg-[#0F172A]/95 p-3 text-slate-100 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Camera Presets */}
                <div className="flex flex-wrap items-center gap-1">
                  {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreset(key)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        preset === key
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      {CAMERA_PRESETS[key].label}
                    </button>
                  ))}
                </div>

                {/* Finish Swatches + Actions */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 border-r border-slate-800 pr-2.5">
                    {FINISH_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFinish(opt.id)}
                        title={opt.label}
                        aria-label={`Material finish: ${opt.label}`}
                        className={`h-5 w-5 rounded-full border transition-transform ${
                          finish === opt.id
                            ? "scale-110 border-white ring-2 ring-blue-500/60"
                            : "border-slate-600 hover:scale-105"
                        }`}
                        style={{ backgroundColor: opt.swatch }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoRotate((v) => !v)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      autoRotate
                        ? "bg-slate-800 text-blue-400"
                        : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {autoRotate ? "Motion On" : "Motion Paused"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetView}
                    className="rounded-md bg-slate-800 p-1.5 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                    title="Reset camera and assembly"
                    aria-label="Reset camera and assembly"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDockOpen(false)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                    title="Hide controls (H)"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Hide</span>
                  </button>
                </div>
              </div>

              {/* Exploded View Slider */}
              <div className="mt-2.5 flex items-center gap-3 border-t border-slate-800/90 pt-2.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Layers className="h-3.5 w-3.5 text-blue-400" />
                  Explode Assembly
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explode}
                  onChange={(e) => setExplode(parseFloat(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-blue-500"
                  aria-label="Explode assembly slider"
                />
                <span className="w-9 text-right font-mono text-[11px] tabular-nums text-slate-300">
                  {Math.round(explode * 100)}%
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDockOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700/90 bg-[#0F172A]/95 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400" />
              <span>Show 3D Controls</span>
              <span className="font-mono text-[10px] text-slate-500">H</span>
            </button>
          )}
        </div>
      )}

      {/* Minimal toggle button in embedded mode when controls are hidden */}
      {!showControls && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-[#0F172A]/90 px-2.5 py-1 font-mono text-[10px] text-slate-300">
            <Eye className="h-3 w-3 text-blue-400" />
            Interactive WebGL
          </span>
        </div>
      )}
    </div>
  );
}

export default ForgeScene3D;
