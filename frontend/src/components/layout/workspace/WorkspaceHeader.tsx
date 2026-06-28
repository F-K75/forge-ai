import { LogOut, PanelsTopLeft } from 'lucide-react'
import { StatusBadge } from '../StatusBadge'
import type { FC } from 'react'

type BuildStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'debugging'

interface WorkspaceHeaderProps {
  status: BuildStatus
  connectionStatus: 'offline' | 'connecting' | 'online' | 'error'
  fileCount: number
  user: { name?: string; email?: string; credits?: number } | null
  showUserMenu: boolean
  setShowUserMenu: (show: boolean) => void
  onLogout: () => void
  onOpenMobileNav: () => void
}

export const WorkspaceHeader: FC<WorkspaceHeaderProps> = ({
  status,
  connectionStatus,
  fileCount,
  user,
  showUserMenu,
  setShowUserMenu,
  onLogout,
  onOpenMobileNav,
}) => {
  const statusLabel = status === 'success' ? 'Build ready' : status === 'running' ? 'Running' : 'Waiting'
  const statusTone = status === 'success' ? 'success' : status === 'running' ? 'success' : 'warning'

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-forge-border bg-forge-surface/95 backdrop-blur-md px-6 h-16 flex-shrink-0">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-forge-text">Forge AI Workspace</h1>
        </div>
        <StatusBadge
          label={statusLabel}
          tone={statusTone}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-xs font-semibold text-white">
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <span className="text-sm text-forge-text-secondary hidden md:block">{user?.name || 'User'}</span>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          aria-label="User menu"
          aria-expanded={showUserMenu}
          className="rounded-lg p-2 text-forge-text-secondary hover:text-forge-text hover:bg-forge-border/30 transition focus:outline-none focus:ring-2 focus:ring-violet-500 lg:hidden"
        >
          <PanelsTopLeft size={18} />
        </button>

        {showUserMenu && (
          <div className="absolute right-4 top-full mt-2 w-56 rounded-lg border border-forge-border bg-forge-surface p-3 shadow-xl z-50" role="menu" aria-label="User menu">
            <div className="mb-2">
              <div className="text-sm font-medium text-forge-text">{user?.name}</div>
              <div className="text-xs text-forge-text-secondary">{user?.email}</div>
              <div className="text-xs text-violet-400 mt-1">{user?.credits || 0} credits</div>
            </div>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-forge-border/30 transition focus:outline-none focus:ring-2 focus:ring-red-500"
              role="menuitem"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}