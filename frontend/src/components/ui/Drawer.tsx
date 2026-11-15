import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'

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
  left: 'inset-y-0 left-0 border-r border-border shadow-m3-3',
  right: 'inset-y-0 right-0 border-l border-border shadow-m3-3',
  bottom: 'inset-x-0 bottom-0 border-t border-border shadow-m3-3',
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

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={() => onOpenChange(false)}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Drawer'}
        className={twMerge(clsx(
          'relative flex flex-col bg-panel text-ink shadow-m3-3',
          sideClasses[side],
          sizeClasses[side][size],
          className
        ))}
        initial={reduceMotion ? { x: 0, y: 0 } : variants.initial}
        animate={{ x: 0, y: 0 }}
        exit={reduceMotion ? { x: 0, y: 0 } : variants.exit}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border bg-panel-alt/60 px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-panel text-muted transition-colors duration-150 hover:text-ink hover:bg-inlay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-ink">
          {children}
        </div>
      </motion.div>
    </div>
  )
}
