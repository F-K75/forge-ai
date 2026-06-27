import { motion } from 'framer-motion'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export function MetricCard({ label, value, icon: Icon, tone = 'neutral' }: MetricCardProps) {
  const toneClasses = {
    neutral: 'text-forge-text-secondary',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-red-300',
    info: 'text-violet-300',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3"
    >
      <div className={clsx('flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]', toneClasses[tone])}>
        <Icon size={12} />
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-forge-text">{value}</div>
    </motion.div>
  )
}
