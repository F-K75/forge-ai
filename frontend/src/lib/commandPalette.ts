/** Window event the CommandPalette listens for, so any control can open it. */
export const OPEN_COMMAND_PALETTE_EVENT = "forge:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}
