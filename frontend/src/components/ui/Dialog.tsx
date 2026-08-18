import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: DialogProps) {
  const reduceMotion = useReducedMotion()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'dialog-title' : undefined}
        aria-describedby={description ? 'dialog-desc' : undefined}
        className={twMerge(clsx(
          'relative w-full apple-glass-strong p-6 shadow-apple-float',
          sizeClasses[size],
          className
        ))}
        style={{ borderRadius: layout.radiusLg }}
        initial={reduceMotion ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        {title && (
          <h2 id="dialog-title" className="text-xl font-semibold text-ink mb-1">
            {title}
          </h2>
        )}
        {description && (
          <p id="dialog-desc" className="text-sm text-muted mb-4">
            {description}
          </p>
        )}
        <div className="text-body text-ink">
          {children}
        </div>
        {footer && (
          <div className="mt-6 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  )
}
