import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  /** @deprecated Kept for persisted localStorage compat; OS shell no longer uses a sidebar. */
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  windowMaximized: boolean
  toggleWindowMaximized: () => void
}

// Device-local UI preferences — no backend round-trip needed.
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      windowMaximized: false,
      toggleWindowMaximized: () =>
        set((state) => ({ windowMaximized: !state.windowMaximized })),
    }),
    { name: 'forge-ui' }
  )
)
