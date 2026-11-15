import { type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import { Button, Heading } from './index'

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
      className={clsx('flex flex-col items-center justify-center py-16 text-center', className)}
      role="status"
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-12 h-12 rounded-lg border border-border bg-panel-alt shadow-m3 flex items-center justify-center mb-4"
        whileHover={reduceMotion ? {} : { scale: 1.04 }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
      >
        <Icon className="w-6 h-6 text-accent" aria-hidden="true" />
      </motion.div>
      <motion.div
        className="mb-2"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Heading level="h3">{title}</Heading>
      </motion.div>
      {description && (
        <motion.div
          className="mb-6 max-w-sm"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Heading level="body">{description}</Heading>
        </motion.div>
      )}
      {(primaryAction || secondaryAction) && (
        <motion.div
          className="flex items-center gap-3"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {primaryAction && (
            <Button variant="primary" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
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
        'bg-surface-high rounded-md',
        animate && 'animate-shimmer',
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
        <div key={i} className="border border-border bg-panel rounded-lg p-6 shadow-m3" aria-hidden="true">
          <Skeleton className="h-6 w-3/4 mb-3 rounded-sm bg-surface-high" />
          <Skeleton className="h-4 w-full mb-2 rounded-sm bg-surface-high" />
          <Skeleton className="h-4 w-5/6 mb-4 rounded-sm bg-surface-high" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-5 w-16 rounded-sm bg-surface-high" />
            <Skeleton className="h-5 w-20 rounded-sm bg-surface-high" />
          </div>
          <Skeleton className="h-9 w-full rounded-md bg-surface-high" />
        </div>
      ))}
    </>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-panel shadow-m3">
          <Skeleton variant="circle" className="w-8 h-8 rounded-full bg-surface-high" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1 rounded-sm bg-surface-high" />
            <Skeleton className="h-3 w-24 rounded-sm bg-surface-high" />
          </div>
        </div>
      ))}
    </div>
  )
}
