// Deterministic, seed-based cover art for project card thumbnails. Stands in
// for real per-project screenshots until the backend has a thumbnail_url
// (no image assets or network calls involved — pure CSS gradients).

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Static greyscale cover gradient (deterministic per seed). */
export function coverGradient(seed: string): string {
  const h = hash(seed);
  const light = 42 + (h % 28);
  const dark = 18 + (h % 16);
  const angle = h % 360;
  return `linear-gradient(${angle}deg, hsl(240 4% ${light}%), hsl(240 3% ${dark}%))`;
}

/** Soft greyscale glow for hover drift layer. */
export function coverGlow(seed: string): string {
  const h = hash(`${seed}:glow`);
  const light = 55 + (h % 20);
  return `radial-gradient(circle, hsl(240 4% ${light}%), transparent 70%)`;
}
