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

// Ember Night atmospheric stops (olive / rust / teal / slate / umber / moss), kept muted
// so a list of swatches reads as one calm family rather than a rainbow.
const ATMOS_STOPS: ReadonlyArray<readonly [string, string]> = [
  ["hsl(60 18% 37%)", "hsl(60 14% 12%)"],
  ["hsl(15 50% 25%)", "hsl(15 40% 9%)"],
  ["hsl(180 18% 29%)", "hsl(180 18% 10%)"],
  ["hsl(240 10% 32%)", "hsl(240 10% 10%)"],
  ["hsl(22 45% 33%)", "hsl(22 40% 10%)"],
  ["hsl(95 15% 32%)", "hsl(95 15% 10%)"],
];

/** Atmospheric swatch for list-row thumbnails (deterministic per seed). */
export function atmosphereSwatch(seed: string): string {
  const h = hash(`${seed}:atmos`);
  const [a, b] = ATMOS_STOPS[h % ATMOS_STOPS.length]!;
  const x = 15 + (h % 60);
  const y = 10 + ((h >> 3) % 50);
  return `radial-gradient(120% 120% at ${x}% ${y}%, ${a} 0%, ${b} 75%)`;
}
