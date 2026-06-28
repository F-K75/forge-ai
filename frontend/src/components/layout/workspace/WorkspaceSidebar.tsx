import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { SidebarItemData } from './constants'
import { type FC } from 'react'

interface WorkspaceSidebarProps {
  items: SidebarItemData[]
}

export const WorkspaceSidebar: FC<WorkspaceSidebarProps> = ({ items }) => {
  return (
    <aside className="fixed inset-y-0 left-0 w-60 flex flex-col bg-forge-surface border-r border-forge-border" role="navigation" aria-label="Main navigation">
      <div className="flex h-16 items-center px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
            <span className="text-sm font-bold text-white">F</span>
          </div>
          <span className="text-lg font-semibold text-forge-text">Forge AI</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(item => (
          <SidebarNavItem key={item.label} item={item} />
        ))}
      </nav>
    </aside>
  )
}

interface SidebarNavItemProps {
  item: SidebarItemData
}

const SidebarNavItem: FC<SidebarNavItemProps> = ({ item }) => {
  const { icon: Icon, label, to } = item

  return (
    <NavLink
      to={to}
      className={({ isActive }) => clsx(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-violet-500/20 text-white'
          : 'text-forge-text-secondary hover:bg-forge-border/30 hover:text-forge-text'
      )}
    >
      {({ isActive } ) => (
        <>
          <Icon size={18} className={isActive ? 'text-violet-400' : ''} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

interface MobileNavProps {
  items: SidebarItemData[]
  isOpen: boolean
  onClose: () => void
}

export const MobileNavigation: FC<MobileNavProps> = ({ items, isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.nav
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            transition={{ type: 'spring', damping: 20 }}
            className="fixed left-0 top-0 bottom-0 w-60 bg-forge-surface border-r border-forge-border z-50 lg:hidden p-3 overflow-y-auto"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="flex items-center justify-between h-16 px-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600">
                  <span className="text-sm font-bold text-white">F</span>
                </div>
                <span className="text-lg font-semibold text-forge-text">Forge AI</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-forge-text-secondary hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-1">
              {items.map(item => (
                <SidebarNavItem key={item.label} item={item} />
              ))}
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  )
}