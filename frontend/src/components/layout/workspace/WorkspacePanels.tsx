import { clsx } from 'clsx'
import { Bot, Workflow, MonitorPlay, Settings, Store, FolderKanban, FileCode2, PanelsTopLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { SidebarItem } from '../SidebarItem'
import type { SidebarItemData } from './constants'

interface BottomNavItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
}

const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'workspace', label: 'Workspace', icon: PanelsTopLeft, to: '/' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, to: '/' },
  { id: 'build', label: 'Build', icon: MonitorPlay, to: '/' },
  { id: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
]

interface TabletSidebarProps {
  items: SidebarItemData[]
}

export const TabletSidebar = ({ items }: TabletSidebarProps) => (
  <nav className="hidden md:flex lg:hidden h-full flex-col items-center gap-4 overflow-y-auto p-2" role="navigation" aria-label="Main navigation">
    {items.map(item => (
      <SidebarItem key={item.label} icon={item.icon} label={item.label} to={item.to} />
    ))}
  </nav>
)

interface MobileBottomNavProps {
  onNavClick: () => void
}

export const MobileBottomNav = ({ onNavClick }: MobileBottomNavProps) => {
  const location = useLocation()

  return (
    <nav className="md:hidden border-t border-forge-border/80 bg-forge-surface/80 px-2 py-2" role="navigation" aria-label="Bottom navigation">
      <div className="flex justify-around">
        {BOTTOM_NAV_ITEMS.map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.to || (item.to === '/' && location.pathname.startsWith('/project'))
          return (
            <NavLink
              key={item.id}
              to={item.to}
              onClick={onNavClick}
              className={({ isActive: navActive }) => clsx(
                'flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs transition focus:outline-none focus:ring-2 focus:ring-violet-500',
                navActive || isActive
                  ? 'text-violet-300'
                  : 'text-forge-text-secondary hover:text-forge-text'
              )}
              aria-label={item.label}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}