/**
 * Atmospheric hues for Ember Night hero and feature surfaces.
 *
 * These are the documented "atmosphere" colours from
 * docs/design/EMBER_NIGHT_DESIGN_LANGUAGE.md (muted olive, rust, teal fading
 * to near-black). They are only ever used inside soft radial/linear gradients,
 * never as flat fills or text colours, so they live here as space-separated
 * RGB triplets rather than as Tailwind tokens.
 */
export const HUE = {
  olive: "110 110 77", // #6E6E4D
  rust: "97 48 32", // #613020
  teal: "61 87 87", // #3D5757
  ember: "255 102 0", // #FF6600 (accent, only ever as a faint glow)
  base: "7 7 7", // #070707 canvas
} as const;

export type Hue = keyof typeof HUE;

export const rgba = (hue: Hue, alpha: number) => `rgb(${HUE[hue]} / ${alpha})`;

/** Soft radial gradient used behind feature and pricing cards. */
export function atmosphere(hue: Hue, at = "50% 100%", strength = 1): string {
  return [
    `radial-gradient(110% 85% at ${at}, ${rgba(hue, strength)} 0%, ${rgba(hue, strength * 0.6)} 45%, ${rgba("base", 0)} 78%)`,
    `linear-gradient(180deg, ${rgba(hue, 0.3)} 0%, ${rgba(hue, 0.6)} 100%)`,
  ].join(", ");
}

/** Film-grain texture as an inline SVG, laid over atmospheric layers. */
export const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
