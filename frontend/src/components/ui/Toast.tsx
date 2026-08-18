import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

interface ToastProps {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}

export function Toast({ title, description, icon, action, onDismiss, className }: ToastProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      role="alert"
      className={twMerge(
        clsx(
          'flex items-start gap-3 rounded-m3 border border-border bg-panel p-4 shadow-apple-lg',
          className
        )
      )}
      style={{ borderRadius: layout.radiusLg }}
      initial={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      {icon && <span className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true">{icon}</span>}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold text-ink">{title}</p>}
        {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-inlay hover:text-ink"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}
