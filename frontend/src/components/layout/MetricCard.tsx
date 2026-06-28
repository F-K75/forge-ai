import { motion } from 'framer-motion'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { type FC } from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export const MetricCard: FC<MetricCardProps> = function MetricCard({ label, value, icon: Icon, tone = 'neutral' }) {
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
      className="rounded-xl border border-forge-border bg-forge-surface p-4"
    >
      <div className="flex items-center justify-between">
        <div className={clsx('flex items-center gap-2 text-xs uppercase tracking-wider', toneClasses[tone])}>
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </div>
        <Icon size={16} className={toneClasses[tone]} opacity={0.2} aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-forge-text">{value}</div>
    </motion.div>
  )
}