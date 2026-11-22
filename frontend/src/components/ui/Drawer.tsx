import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'

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
  left: 'inset-y-0 left-0 border-r border-border',
  right: 'inset-y-0 right-0 ml-auto border-l border-border',
  bottom: 'inset-x-0 bottom-0 mt-auto border-t border-border',
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
    left: { initial: { x: '-100%' }, exit: { x: '-100%' } },
    right: { initial: { x: '100%' }, exit: { x: '100%' } },
    bottom: { initial: { y: '100%' }, exit: { y: '100%' } },
  }

  const variants = animationVariants[side]

  return (
    <div className="fixed inset-0 z-[70] flex">
      <motion.div
        className="absolute inset-0 bg-slate-950/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        className={twMerge(
          clsx(
            'relative flex flex-col bg-panel text-ink shadow-apple-float',
            sideClasses[side],
            sizeClasses[side][size],
            className
          )
        )}
        initial={reduceMotion ? { x: 0, y: 0 } : variants.initial}
        animate={{ x: 0, y: 0 }}
        exit={reduceMotion ? { x: 0, y: 0 } : variants.exit}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">{title}</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-alt hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-ink">
          {children}
        </div>
      </motion.div>
    </div>
  )
}
