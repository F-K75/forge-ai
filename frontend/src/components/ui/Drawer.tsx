import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  children: ReactNode
  side?: 'left' | 'right' | 'bottom'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sideClasses: Record<string, string> = {
  left: 'inset-y-0 left-0 border-r',
  right: 'inset-y-0 right-0 border-l',
  bottom: 'inset-x-0 bottom-0 border-t',
}

const sizeClasses: Record<string, Record<string, string>> = {
  left: { sm: 'w-80', md: 'w-96', lg: 'w-[28rem]' },
  right: { sm: 'w-80', md: 'w-96', lg: 'w-[28rem]' },
  bottom: { sm: 'h-64', md: 'h-80', lg: 'h-96' },
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  side = 'right',
  size = 'md',
  className,
}: DrawerProps) {
  const reduceMotion = useReducedMotion()

  if (!open) return null

  const animationVariants = {
    left: { initial: { x: '-100%' }, animate: { x: 0 }, exit: { x: '-100%' } },
    right: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } },
    bottom: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } },
  }

  const variants = animationVariants[side]

  return (
    <div className="fixed inset-0 z-[70] flex">
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
        className={twMerge(clsx(
          'relative flex flex-col apple-glass-strong shadow-apple-float',
          sideClasses[side],
          sizeClasses[side][size],
          className
        ))}
        style={{ borderRadius: side === 'bottom' ? layout.radiusLg : undefined }}
        initial={reduceMotion ? { x: 0, y: 0 } : variants.initial}
        animate={{ x: 0, y: 0 }}
        exit={reduceMotion ? { x: 0, y: 0 } : variants.exit}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border-soft px-6 py-4">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-inlay hover:text-ink"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 text-body text-ink">
          {children}
        </div>
      </motion.div>
    </div>
  )
}
