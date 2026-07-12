// Deterministic, seed-based cover art for project card thumbnails. Stands in
// for real per-project screenshots until the backend has a thumbnail_url
// (no image assets or network calls involved — pure CSS gradients).

const HUE_STEP = 47; // arbitrary prime-ish step so adjacent seeds don't cluster in hue

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Static "photo" gradient shown by default (rendered grayscale by the card). */
export function coverGradient(seed: string): string {
  const h = hash(seed);
  const hue = (h * HUE_STEP) % 360;
  const hue2 = (hue + 55) % 360;
  const angle = h % 360;
  return `linear-gradient(${angle}deg, hsl(${hue} 65% 52%), hsl(${hue2} 65% 38%))`;
}

/** Soft radial glow used for the hover "video" drift layer, revealed in color. */
export function coverGlow(seed: string): string {
  const h = hash(`${seed}:glow`);
  const hue = (h * HUE_STEP) % 360;
  return `radial-gradient(circle, hsl(${hue} 75% 55%), transparent 70%)`;
}
