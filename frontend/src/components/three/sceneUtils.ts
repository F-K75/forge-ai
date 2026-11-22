import * as THREE from "three";

const SOFTWARE_GL_PATTERN = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

/**
 * Probes WebGL2 renderer string once and immediately releases the probe context.
 * Use the returned flag strictly for rendering-cost gating (pixelRatio, shadows,
 * post-processing, loop pacing) — never to swap geometry or hide features.
 */
export function detectSoftwareGl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return SOFTWARE_GL_PATTERN.test(renderer);
  } catch {
    return true;
  }
}

/**
 * Paces continuous loops on software WebGL via WebGL2 fenceSync so the compositor
 * stays responsive and input never queues behind backlogged software frames.
 */
export function afterDraw(renderer: THREE.WebGLRenderer, callback: () => void): () => void {
  let cancelled = false;
  let timerId: number | null = null;
  let rafId: number | null = null;

  const gl = renderer.getContext();
  if (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync) {
      gl.flush();
      const poll = () => {
        if (cancelled) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
          gl.deleteSync(sync);
          timerId = window.setTimeout(() => {
            if (!cancelled) callback();
          }, 80);
        } else if (status === gl.WAIT_FAILED) {
          gl.deleteSync(sync);
          timerId = window.setTimeout(() => {
            if (!cancelled) callback();
          }, 80);
        } else {
          rafId = window.requestAnimationFrame(poll);
        }
      };
      rafId = window.requestAnimationFrame(poll);
      return () => {
        cancelled = true;
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        if (timerId !== null) window.clearTimeout(timerId);
      };
    }
  }

  timerId = window.setTimeout(() => {
    if (!cancelled) callback();
  }, 80);

  return () => {
    cancelled = true;
    if (timerId !== null) window.clearTimeout(timerId);
  };
}

/**
 * Procedural brushed anodized metal texture for roughness/bump variation.
 */
export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const lum = 104 + Math.floor(Math.sin(y * 0.7) * 16 + ((y * 37) % 28));
      ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      ctx.fillRect(0, y, 256, 1);
    }
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 160; i++) {
      const y = (i * 53) % 256;
      const x = (i * 97) % 256;
      const w = 32 + ((i * 29) % 120);
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#222222";
      ctx.fillRect(x, y, w, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural precision circuit etch map for chassis plate roughness variation.
 */
export function createCircuitEtchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#787878";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#b8b8b8";
    ctx.lineWidth = 1.5;
    for (let i = 16; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
    }
    ctx.fillStyle = "#505050";
    for (let y = 16; y < 256; y += 64) {
      for (let x = 16; x < 256; x += 64) {
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural architectural studio grid floor texture (SRGB color space).
 */
export function createStudioFloorTexture(isDark: boolean, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = isDark ? "#0d121d" : "#eef2f7";
    ctx.fillRect(0, 0, 512, 512);

    // Subtle secondary grid
    ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.055)";
    ctx.lineWidth = 1;
    const step = 64;
    for (let i = 0; i <= 512; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Major architectural datum lines
    ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.11)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, 510.5, 510.5);

    // Precision corner crosshairs
    ctx.strokeStyle = isDark ? "rgba(59, 130, 246, 0.35)" : "rgba(37, 99, 235, 0.28)";
    ctx.lineWidth = 2;
    const cross = 10;
    ctx.beginPath();
    ctx.moveTo(0, cross);
    ctx.lineTo(0, 0);
    ctx.lineTo(cross, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.anisotropy = Math.min(8, maxAnisotropy || 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft radial contact shadow plane texture — prevents floating silhouettes
 * even when directional shadow maps are bypassed on software WebGL.
 */
export function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
    grad.addColorStop(0, "rgba(4, 8, 18, 0.56)");
    grad.addColorStop(0.45, "rgba(4, 8, 18, 0.24)");
    grad.addColorStop(0.75, "rgba(4, 8, 18, 0.06)");
    grad.addColorStop(1, "rgba(4, 8, 18, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Recursively disposes geometries, materials, and textures owned by a Three.js scene graph.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
      disposedGeometries.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const matOrMats = mesh.material;
    if (!matOrMats) return;
    const mats = Array.isArray(matOrMats) ? matOrMats : [matOrMats];
    for (const mat of mats) {
      if (disposedMaterials.has(mat)) continue;
      disposedMaterials.add(mat);
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      }
      mat.dispose();
    }
  });
}
