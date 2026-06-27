import { motion } from 'framer-motion'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface SidebarItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  badge?: string
  onClick?: () => void
}

export function SidebarItem({ icon: Icon, label, active = false, badge, onClick }: SidebarItemProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ x: 2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={clsx(
        'group flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition-all',
        active
          ? 'border-violet-500/40 bg-violet-500/10 text-violet-100 shadow-[0_0_0_1px_rgba(124,58,237,0.18)]'
          : 'border-transparent bg-transparent text-forge-text-secondary hover:border-forge-border hover:bg-forge-surface/70 hover:text-forge-text'
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon size={16} className={active ? 'text-violet-300' : 'text-forge-muted'} />
        <span className="font-medium">{label}</span>
      </span>
      {badge && (
        <span className="rounded-full border border-forge-border/70 bg-forge-surface/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-forge-text-secondary">
          {badge}
        </span>
      )}
    </motion.button>
  )
}
