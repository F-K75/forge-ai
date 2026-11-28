import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  /** Controls collapsed (56px) vs expanded (220px) state of the LeftNavRail on desktop. */
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  windowMaximized: boolean
  toggleWindowMaximized: () => void
  /**
   * Forge OS: capabilities pinned to the nav panel. Window layout, nav state
   * and the active session live in the OS `WorkspaceState` (server-synced,
   * src/os/shell/workspaceClient.ts); `WorkspaceState` has no field for pins
   * yet, so they stay device-local here.
   */
  pinnedCapabilities: string[]
  togglePinnedCapability: (id: string) => void
  /** Forge OS composer: last chosen model tier ("auto" | "fast" | "balanced" | "best"). */
  modelTier: 'auto' | 'fast' | 'balanced' | 'best'
  setModelTier: (tier: UiState['modelTier']) => void
}

const DEFAULT_PINS = ['projects.manage', 'fleet.overview', 'plan.initiatives']

// Device-local UI preferences — no backend round-trip needed.
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      windowMaximized: false,
      toggleWindowMaximized: () =>
        set((state) => ({ windowMaximized: !state.windowMaximized })),
      pinnedCapabilities: DEFAULT_PINS,
      togglePinnedCapability: (id) =>
        set((state) => ({
          pinnedCapabilities: state.pinnedCapabilities.includes(id)
            ? state.pinnedCapabilities.filter((p) => p !== id)
            : [...state.pinnedCapabilities, id].slice(-12),
        })),
      modelTier: 'auto',
      setModelTier: (modelTier) => set({ modelTier }),
    }),
    { name: 'forge-ui' }
  )
)
