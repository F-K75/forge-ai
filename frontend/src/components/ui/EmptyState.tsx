import { type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { motion, useReducedMotion } from 'motion/react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  primaryAction?: { label: string; onClick?: () => void }
  secondaryAction?: { label: string; onClick?: () => void }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, primaryAction, secondaryAction, className }: EmptyStateProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={clsx('flex flex-col items-center justify-center py-12 text-center', className)}
      role="status"
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4"
        whileHover={reduceMotion ? {} : { scale: 1.08, rotate: 5 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <Icon className="w-8 h-8 text-muted" aria-hidden="true" />
      </motion.div>
      <motion.h3
        className="text-lg font-semibold text-ink mb-2"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {title}
      </motion.h3>
      {description && (
        <motion.p
          className="text-sm text-muted mb-4 max-w-sm"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {description}
        </motion.p>
      )}
      {primaryAction && (
        <motion.button
          onClick={primaryAction.onClick}
          className="px-5 py-2 bg-accent text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={reduceMotion ? {} : { scale: 1.04 }}
          whileTap={reduceMotion ? {} : { scale: 0.97 }}
        >
          {primaryAction.label}
        </motion.button>
      )}
      {secondaryAction && (
        <motion.button
          onClick={secondaryAction.onClick}
          className="mt-2 px-5 py-2 text-sm text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent rounded"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          whileHover={reduceMotion ? {} : { scale: 1.03 }}
        >
          {secondaryAction.label}
        </motion.button>
      )}
    </motion.div>
  )
}

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'rect' | 'circle'
  animate?: boolean
}

export function Skeleton({ className, variant = 'rect', animate = true }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'bg-panel rounded',
        animate && 'animate-pulse',
        variant === 'text' && 'h-4',
        variant === 'circle' && 'rounded-full',
        variant === 'rect' && 'rounded-lg',
        className
      )}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-6" aria-hidden="true">
          <Skeleton className="h-6 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-4" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-2xl glass">
          <Skeleton variant="circle" className="w-8 h-8" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
