import type { ReactNode } from "react";

/** Window event the CommandPalette listens for, so any control can open it. */
export const OPEN_COMMAND_PALETTE_EVENT = "forge:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

/**
 * One palette entry. The classic shell builds these from its static page list;
 * the Forge OS shell builds them from the capability registry, the session
 * history and window/workspace actions (src/os/shell/osPalette.tsx).
 */
export interface PaletteItem {
  id: string;
  label: string;
  section: string;
  icon?: ReactNode;
  keywords?: string[];
  /** Muted text on the right (shortcut, category, date). */
  hint?: string;
  run: () => void;
}

/** Score an item against a query: 0 = no match; higher is better. */
export function scorePaletteItem(item: PaletteItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = item.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/[\s(/-]+/).some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hay = `${label} ${item.section.toLowerCase()} ${(item.keywords ?? []).join(" ").toLowerCase()}`;
  return tokens.every((t) => hay.includes(t)) ? 20 : 0;
}

/** Filter and rank, keeping section order stable for equal scores. */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) return items;
  return items
    .map((item, i) => ({ item, i, s: scorePaletteItem(item, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
