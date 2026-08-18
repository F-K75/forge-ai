import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  className?: string
}

const sideClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  side = 'bottom',
  align = 'center',
  className,
}: PopoverProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={twMerge(clsx('relative inline-flex', className))}>
      {trigger}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[59]"
            onClick={() => onOpenChange?.(false)}
          />
          <motion.div
            role="menu"
            className={twMerge(clsx(
              'absolute z-[60] min-w-[200px] apple-glass-strong shadow-apple-float overflow-hidden',
              sideClasses[side]
            ))}
            style={{ borderRadius: layout.radiusMd }}
            initial={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="py-1.5">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}
