import * as THREE from "three";
import {
  createBrushedMetalTexture,
  createCircuitEtchTexture,
  createRadialShadowTexture,
} from "./sceneUtils";

export type StudioFinish = "obsidian" | "titanium" | "blueprint";

export interface AgentNodeSpec {
  id: string;
  name: string;
  role: string;
  summary: string;
  latencyMs: number;
  tasksCompleted: number;
  colorHex: string;
  orbitRadius: number;
  orbitHeight: number;
  phase: number;
}

export const FORGE_AGENT_SPECS: AgentNodeSpec[] = [
  {
    id: "architect",
    name: "Architect",
    role: "System Topology",
    summary: "Compiles domain models, service contracts, and API schemas before code generation.",
    latencyMs: 142,
    tasksCompleted: 184,
    colorHex: "#2563EB",
    orbitRadius: 2.35,
    orbitHeight: 1.95,
    phase: 0,
  },
  {
    id: "designer",
    name: "Designer",
    role: "Interface Systems",
    summary: "Establishes semantic tokens, typographic grids, and accessible component states.",
    latencyMs: 118,
    tasksCompleted: 149,
    colorHex: "#8B5CF6",
    orbitRadius: 2.35,
    orbitHeight: 2.25,
    phase: Math.PI / 3,
  },
  {
    id: "developer",
    name: "Developer",
    role: "Full-Stack Synthesis",
    summary: "Implements typed frontend views, API handlers, and database migrations in parallel.",
    latencyMs: 164,
    tasksCompleted: 312,
    colorHex: "#059669",
    orbitRadius: 2.35,
    orbitHeight: 1.8,
    phase: (2 * Math.PI) / 3,
  },
  {
    id: "integration",
    name: "Integration",
    role: "Contracts & Wiring",
    summary: "Binds authentication, queues, and external webhooks with strict contract checks.",
    latencyMs: 129,
    tasksCompleted: 127,
    colorHex: "#0284C7",
    orbitRadius: 2.35,
    orbitHeight: 2.15,
    phase: Math.PI,
  },
  {
    id: "qa",
    name: "QA Validator",
    role: "Verification Loop",
    summary: "Runs deterministic test suites, type checks, and automated build repair passes.",
    latencyMs: 96,
    tasksCompleted: 268,
    colorHex: "#0EA5E9",
    orbitRadius: 2.35,
    orbitHeight: 1.9,
    phase: (4 * Math.PI) / 3,
  },
  {
    id: "pm",
    name: "Product",
    role: "Specs & Sprints",
    summary: "Translates product goals into acceptance criteria, milestones, and release notes.",
    latencyMs: 108,
    tasksCompleted: 116,
    colorHex: "#D97706",
    orbitRadius: 2.35,
    orbitHeight: 2.2,
    phase: (5 * Math.PI) / 3,
  },
];

export interface ForgeRigHandles {
  root: THREE.Group;
  plinthGroup: THREE.Group;
  radiatorGroup: THREE.Group;
  coreGroup: THREE.Group;
  innerGimbal: THREE.Group;
  outerGimbal: THREE.Group;
  agentOrbitGroup: THREE.Group;
  agentGroups: Map<string, THREE.Group>;
  agentEmissiveMaterials: Map<string, THREE.MeshStandardMaterial>;
  hitProxies: THREE.Object3D[];
  applyFinish: (finish: StudioFinish) => void;
}

const FINISH_PALETTES: Record<
  StudioFinish,
  {
    plinthColor: number;
    plinthRoughness: number;
    plinthMetalness: number;
    metalColor: number;
    metalRoughness: number;
    metalMetalness: number;
    gimbalOuterColor: number;
    gimbalInnerColor: number;
    accentColor: number;
    prismColor: number;
  }
> = {
  obsidian: {
    plinthColor: 0x161d2d,
    plinthRoughness: 0.56,
    plinthMetalness: 0.62,
    metalColor: 0xcbd5e1,
    metalRoughness: 0.22,
    metalMetalness: 0.9,
    gimbalOuterColor: 0x1e293b,
    gimbalInnerColor: 0x94a3b8,
    accentColor: 0x3b82f6,
    prismColor: 0x60a5fa,
  },
  titanium: {
    plinthColor: 0x475569,
    plinthRoughness: 0.42,
    plinthMetalness: 0.78,
    metalColor: 0xe2e8f0,
    metalRoughness: 0.18,
    metalMetalness: 0.94,
    gimbalOuterColor: 0x64748b,
    gimbalInnerColor: 0xf1f5f9,
    accentColor: 0x2563eb,
    prismColor: 0x38bdf8,
  },
  blueprint: {
    plinthColor: 0x172554,
    plinthRoughness: 0.52,
    plinthMetalness: 0.55,
    metalColor: 0x93c5fd,
    metalRoughness: 0.24,
    metalMetalness: 0.86,
    gimbalOuterColor: 0x1e3a8a,
    gimbalInnerColor: 0xbfdbfe,
    accentColor: 0x38bdf8,
    prismColor: 0x7dd3fc,
  },
};

function createRegularPolygonShape(sides: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/**
 * Assembles the multi-part procedural Forge Autonomous Core & Agent Orbital Rig.
 * Bottom-center pivot sits cleanly at y = 0 with a soft radial contact shadow.
 */
export function createForgeCoreRig(
  isSoftwareGl: boolean,
  initialFinish: StudioFinish = "obsidian"
): ForgeRigHandles {
  const root = new THREE.Group();
  root.name = "ForgeCoreRig";

  const brushedTex = createBrushedMetalTexture();
  const etchTex = createCircuitEtchTexture();
  const shadowTex = createRadialShadowTexture();

  const palette = FINISH_PALETTES[initialFinish];

  // Shared PBR materials with intentional roughness/metalness contrast (>= 0.30 spread)
  const matteRubberMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.88,
    metalness: 0.05,
  });

  const plinthMat = new THREE.MeshStandardMaterial({
    color: palette.plinthColor,
    roughness: palette.plinthRoughness,
    metalness: palette.plinthMetalness,
    roughnessMap: etchTex,
    bumpMap: etchTex,
    bumpScale: 0.015,
  });

  const brushedMetalMat = new THREE.MeshPhysicalMaterial({
    color: palette.metalColor,
    roughness: palette.metalRoughness,
    metalness: palette.metalMetalness,
    clearcoat: 0.25,
    clearcoatRoughness: 0.2,
    roughnessMap: brushedTex,
    bumpMap: brushedTex,
    bumpScale: 0.008,
  });

  const gimbalOuterMat = new THREE.MeshStandardMaterial({
    color: palette.gimbalOuterColor,
    roughness: 0.62,
    metalness: 0.58,
    roughnessMap: brushedTex,
  });

  const gimbalInnerMat = new THREE.MeshStandardMaterial({
    color: palette.gimbalInnerColor,
    roughness: 0.2,
    metalness: 0.92,
  });

  const cobaltAccentMat = new THREE.MeshStandardMaterial({
    color: palette.accentColor,
    emissive: new THREE.Color(palette.accentColor),
    emissiveIntensity: 0.45,
    roughness: 0.24,
    metalness: 0.4,
  });

  const opticalCoreMat = new THREE.MeshPhysicalMaterial({
    color: palette.prismColor,
    roughness: 0.06,
    metalness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.84,
    thickness: 0.9,
    ior: 1.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    opacity: isSoftwareGl ? 0.86 : 1,
    transparent: isSoftwareGl,
    depthWrite: !isSoftwareGl ? false : true,
    emissive: new THREE.Color(palette.accentColor),
    emissiveIntensity: isSoftwareGl ? 0.35 : 0.22,
  });

  // 1. Soft radial contact shadow plane (y = 0.005)
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 7.6),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.005;
  root.add(contactShadow);

  // 2. Plinth Assembly (y = 0..0.46) — chamfered octagonal chassis + 8 rubber vibration pads + recessed datum ring
  const plinthGroup = new THREE.Group();
  plinthGroup.name = "PlinthAssembly";

  const padGeom = new THREE.CylinderGeometry(0.14, 0.16, 0.06, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const pad = new THREE.Mesh(padGeom, matteRubberMat);
    pad.position.set(Math.cos(a) * 1.48, 0.03, Math.sin(a) * 1.48);
    pad.castShadow = !isSoftwareGl;
    pad.receiveShadow = !isSoftwareGl;
    plinthGroup.add(pad);
  }

  const octShape = createRegularPolygonShape(8, 1.62);
  const plinthGeom = new THREE.ExtrudeGeometry(octShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
  plinthGeom.rotateX(-Math.PI / 2);
  const plinthMesh = new THREE.Mesh(plinthGeom, plinthMat);
  plinthMesh.position.y = 0.1;
  plinthMesh.castShadow = !isSoftwareGl;
  plinthMesh.receiveShadow = !isSoftwareGl;
  plinthGroup.add(plinthMesh);

  // Upper beveled collar plate
  const upperOctShape = createRegularPolygonShape(8, 1.24);
  const upperPlateGeom = new THREE.ExtrudeGeometry(upperOctShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  upperPlateGeom.rotateX(-Math.PI / 2);
  const upperPlate = new THREE.Mesh(upperPlateGeom, brushedMetalMat);
  upperPlate.position.y = 0.43;
  upperPlate.castShadow = !isSoftwareGl;
  upperPlate.receiveShadow = !isSoftwareGl;
  plinthGroup.add(upperPlate);

  // Recessed illuminated calibration ring
  const datumRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.34, 0.022, 14, 64),
    cobaltAccentMat
  );
  datumRing.rotation.x = Math.PI / 2;
  datumRing.position.y = 0.435;
  plinthGroup.add(datumRing);

  root.add(plinthGroup);

  // 3. Lathe-Turned Central Radiator & Stepped Core Column (y = 0.52..1.34)
  const radiatorGroup = new THREE.Group();
  radiatorGroup.name = "RadiatorColumn";

  const lathePoints: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.52),
    new THREE.Vector2(0.76, 0.52),
    new THREE.Vector2(0.76, 0.62),
    new THREE.Vector2(0.56, 0.68),
    new THREE.Vector2(0.56, 0.74),
    new THREE.Vector2(0.68, 0.78),
    new THREE.Vector2(0.68, 0.84),
    new THREE.Vector2(0.52, 0.88),
    new THREE.Vector2(0.52, 0.94),
    new THREE.Vector2(0.62, 0.98),
    new THREE.Vector2(0.62, 1.04),
    new THREE.Vector2(0.44, 1.12),
    new THREE.Vector2(0.44, 1.28),
    new THREE.Vector2(0.28, 1.34),
    new THREE.Vector2(0.0, 1.34),
  ];
  const radiatorGeom = new THREE.LatheGeometry(lathePoints, 32);
  const radiatorMesh = new THREE.Mesh(radiatorGeom, brushedMetalMat);
  radiatorMesh.castShadow = !isSoftwareGl;
  radiatorMesh.receiveShadow = !isSoftwareGl;
  radiatorGroup.add(radiatorMesh);

  // Four vertical structural struts anchoring the gimbal cradle
  const strutGeom = new THREE.BoxGeometry(0.09, 0.72, 0.14);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const strut = new THREE.Mesh(strutGeom, gimbalOuterMat);
    strut.position.set(Math.cos(angle) * 0.82, 0.86, Math.sin(angle) * 0.82);
    strut.rotation.y = -angle;
    strut.rotation.z = 0.16;
    strut.castShadow = !isSoftwareGl;
    radiatorGroup.add(strut);
  }
  root.add(radiatorGroup);

  // 4. Optical Compute Core Prism + Inner Cradle (centered at y = 2.02)
  const coreGroup = new THREE.Group();
  coreGroup.name = "OpticalComputeCore";
  coreGroup.position.y = 2.02;

  const corePrism = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), opticalCoreMat);
  corePrism.castShadow = !isSoftwareGl;
  coreGroup.add(corePrism);

  // Inner metallic nucleus inside translucent prism
  const innerNucleus = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.22, 0),
    cobaltAccentMat
  );
  coreGroup.add(innerNucleus);

  // Top & bottom precision caps framing the core
  const capGeom = new THREE.CylinderGeometry(0.16, 0.28, 0.14, 8);
  const topCap = new THREE.Mesh(capGeom, brushedMetalMat);
  topCap.position.y = 0.64;
  coreGroup.add(topCap);

  const botCap = new THREE.Mesh(capGeom, brushedMetalMat);
  botCap.position.y = -0.64;
  botCap.rotation.z = Math.PI;
  coreGroup.add(botCap);

  root.add(coreGroup);

  // 5. Counter-Rotating Precision Gimbal Rings (centered at y = 2.02)
  const innerGimbal = new THREE.Group();
  innerGimbal.name = "InnerGimbal";
  innerGimbal.position.y = 2.02;

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.96, 0.048, 16, 64),
    gimbalInnerMat
  );
  innerRing.castShadow = !isSoftwareGl;
  innerGimbal.add(innerRing);

  const lugGeom = new THREE.BoxGeometry(0.12, 0.16, 0.14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const lug = new THREE.Mesh(lugGeom, cobaltAccentMat);
    lug.position.set(Math.cos(a) * 0.96, Math.sin(a) * 0.96, 0);
    lug.rotation.z = a;
    innerGimbal.add(lug);
  }
  root.add(innerGimbal);

  const outerGimbal = new THREE.Group();
  outerGimbal.name = "OuterGimbal";
  outerGimbal.position.y = 2.02;

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.36, 0.064, 16, 72),
    gimbalOuterMat
  );
  outerRing.castShadow = !isSoftwareGl;
  outerGimbal.add(outerRing);

  const bracketGeom = new THREE.BoxGeometry(0.16, 0.22, 0.18);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bracket = new THREE.Mesh(bracketGeom, brushedMetalMat);
    bracket.position.set(Math.cos(a) * 1.36, Math.sin(a) * 1.36, 0);
    bracket.rotation.z = a;
    outerGimbal.add(bracket);
  }
  root.add(outerGimbal);

  // 6. Six Specialist Agent Orbital Nodes + Curved TubeGeometry Data Conduits
  const agentOrbitGroup = new THREE.Group();
  agentOrbitGroup.name = "AgentOrbitalDeck";

  const agentGroups = new Map<string, THREE.Group>();
  const agentEmissiveMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const hitProxies: THREE.Object3D[] = [];

  const hexChassisShape = createRegularPolygonShape(6, 0.24);
  const hexChassisGeom = new THREE.ExtrudeGeometry(hexChassisShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  hexChassisGeom.rotateX(-Math.PI / 2);

  const sensorCollarGeom = new THREE.TorusGeometry(0.19, 0.022, 12, 24);
  const lensGeom = new THREE.SphereGeometry(0.095, 16, 16);
  const proxyGeom = new THREE.SphereGeometry(0.38, 12, 12);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

  // Orbital datum rail connecting the 6 nodes
  const orbitalRail = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, 0.014, 10, 96),
    gimbalOuterMat
  );
  orbitalRail.rotation.x = Math.PI / 2;
  orbitalRail.position.y = 2.02;
  agentOrbitGroup.add(orbitalRail);

  for (const spec of FORGE_AGENT_SPECS) {
    const nodeGroup = new THREE.Group();
    nodeGroup.name = `Agent_${spec.id}`;
    const x = Math.cos(spec.phase) * spec.orbitRadius;
    const z = Math.sin(spec.phase) * spec.orbitRadius;
    nodeGroup.position.set(x, spec.orbitHeight, z);

    // 4-part composite Agent Node: beveled hex chassis, brushed collar, optical lens, underside trim
    const chassis = new THREE.Mesh(hexChassisGeom, plinthMat);
    chassis.position.y = -0.06;
    chassis.castShadow = !isSoftwareGl;
    nodeGroup.add(chassis);

    const collar = new THREE.Mesh(sensorCollarGeom, brushedMetalMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.08;
    nodeGroup.add(collar);

    const emissiveMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.colorHex),
      emissive: new THREE.Color(spec.colorHex),
      emissiveIntensity: 0.85,
      roughness: 0.16,
      metalness: 0.25,
    });
    agentEmissiveMaterials.set(spec.id, emissiveMat);

    const lens = new THREE.Mesh(lensGeom, emissiveMat);
    lens.position.y = 0.1;
    nodeGroup.add(lens);

    const undersideRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.08, 0.08, 6),
      matteRubberMat
    );
    undersideRing.position.y = -0.11;
    nodeGroup.add(undersideRing);

    // Dedicated raycast hit proxy (layer 1)
    const hitProxy = new THREE.Mesh(proxyGeom, proxyMat);
    hitProxy.userData.agentId = spec.id;
    hitProxy.layers.set(1);
    nodeGroup.add(hitProxy);
    hitProxies.push(hitProxy);

    // Curved data conduit from core pedestal out to the agent node
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(spec.phase) * 0.72, 1.05, Math.sin(spec.phase) * 0.72),
      new THREE.Vector3(Math.cos(spec.phase) * 1.62, 1.15, Math.sin(spec.phase) * 1.62),
      new THREE.Vector3(x * 0.94, spec.orbitHeight - 0.12, z * 0.94),
    ]);
    const conduit = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 18, 0.015, 8, false),
      gimbalInnerMat
    );
    agentOrbitGroup.add(conduit);

    agentGroups.set(spec.id, nodeGroup);
    agentOrbitGroup.add(nodeGroup);
  }
  root.add(agentOrbitGroup);

  // 7. Grounded InstancedMesh Studio Calibration Array (54 architectural micro-pylons)
  const pylonCount = 54;
  const pylonGeom = new THREE.CylinderGeometry(0.032, 0.045, 1, 6);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.65,
  });
  const pylonInstanced = new THREE.InstancedMesh(pylonGeom, pylonMat, pylonCount);
  pylonInstanced.castShadow = false;
  pylonInstanced.receiveShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  for (let i = 0; i < pylonCount; i++) {
    const isOuter = i >= 24;
    const ringIndex = isOuter ? i - 24 : i;
    const totalInRing = isOuter ? 30 : 24;
    const angle = (ringIndex / totalInRing) * Math.PI * 2;
    const radius = isOuter ? 3.55 : 2.18;
    const height = isOuter
      ? 0.08 + ((i % 5) * 0.035)
      : 0.06 + ((i % 3) * 0.028);

    dummy.position.set(Math.cos(angle) * radius, height * 0.5, Math.sin(angle) * radius);
    dummy.scale.set(1, height, 1);
    dummy.rotation.y = angle;
    dummy.updateMatrix();
    pylonInstanced.setMatrixAt(i, dummy.matrix);

    if (i % 6 === 0) {
      c.setHex(palette.accentColor);
    } else {
      c.setHex(isOuter ? 0x64748b : 0x94a3b8);
    }
    pylonInstanced.setColorAt(i, c);
  }
  pylonInstanced.instanceMatrix.needsUpdate = true;
  if (pylonInstanced.instanceColor) pylonInstanced.instanceColor.needsUpdate = true;
  pylonInstanced.computeBoundingSphere();
  root.add(pylonInstanced);

  const applyFinish = (finish: StudioFinish) => {
    const next = FINISH_PALETTES[finish];
    plinthMat.color.setHex(next.plinthColor);
    plinthMat.roughness = next.plinthRoughness;
    plinthMat.metalness = next.plinthMetalness;
    brushedMetalMat.color.setHex(next.metalColor);
    brushedMetalMat.roughness = next.metalRoughness;
    brushedMetalMat.metalness = next.metalMetalness;
    gimbalOuterMat.color.setHex(next.gimbalOuterColor);
    gimbalInnerMat.color.setHex(next.gimbalInnerColor);
    cobaltAccentMat.color.setHex(next.accentColor);
    cobaltAccentMat.emissive.setHex(next.accentColor);
    opticalCoreMat.color.setHex(next.prismColor);
    opticalCoreMat.emissive.setHex(next.accentColor);
  };

  return {
    root,
    plinthGroup,
    radiatorGroup,
    coreGroup,
    innerGimbal,
    outerGimbal,
    agentOrbitGroup,
    agentGroups,
    agentEmissiveMaterials,
    hitProxies,
    applyFinish,
  };
}
