import { motion } from 'framer-motion'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import React from 'react'

interface SidebarItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  badge?: string
  to?: string
  onCloseMobileNav?: () => void
}

export const SidebarItem = React.memo(function SidebarItem({ icon: Icon, label, active = false, badge, to, onCloseMobileNav }: SidebarItemProps) {
  if (to) {
    return (
      <NavLink
        to={to}
        onClick={onCloseMobileNav}
        className={({ isActive: navActive }) => clsx(
          'group flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
          (navActive || active)
            ? 'border-violet-500/40 bg-violet-500/10 text-violet-100'
            : 'border-transparent bg-transparent text-forge-text-secondary hover:border-forge-border hover:bg-forge-surface/70 hover:text-forge-text'
        )}
        aria-label={`Navigate to ${label}`}
      >
        {({ isActive: navActive }) => (
          <>
            <span className="flex items-center gap-2.5">
              <Icon 
                size={16} 
                className={(navActive || active) ? 'text-violet-300' : 'text-forge-muted'} 
                aria-hidden="true"
              />
              <span className="font-medium">{label}</span>
            </span>
            {badge && (
              <span className="rounded-full border border-forge-border/70 bg-forge-surface/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-forge-text-secondary">
                {badge}
              </span>
            )}
          </>
        )}
      </NavLink>
    )
  }

  return (
    <motion.button
      type="button"
      whileHover={{ x: 2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      aria-current={active ? 'page' : undefined}
      aria-label={`Navigate to ${label}`}
      className={clsx(
        'group flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        active
          ? 'border-violet-500/40 bg-violet-500/10 text-violet-100'
          : 'border-transparent bg-transparent text-forge-text-secondary hover:border-forge-border hover:bg-forge-surface/70 hover:text-forge-text'
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon 
          size={16} 
          className={active ? 'text-violet-300' : 'text-forge-muted'} 
          aria-hidden="true"
        />
        <span className="font-medium">{label}</span>
      </span>
      {badge && (
        <span className="rounded-full border border-forge-border/70 bg-forge-surface/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-forge-text-secondary">
          {badge}
        </span>
      )}
    </motion.button>
  )
})