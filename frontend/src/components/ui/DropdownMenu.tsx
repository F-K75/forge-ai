import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'

interface DropdownMenuItemProps {
  children: ReactNode
  icon?: ReactNode
  destructive?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
}

export function DropdownMenuItem({
  children,
  icon,
  destructive = false,
  disabled = false,
  onClick,
  className,
}: DropdownMenuItemProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={twMerge(
        clsx(
          'flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors duration-fast outline-none',
          destructive ? 'text-error hover:bg-error/10' : 'text-ink hover:bg-inlay',
          disabled && 'cursor-not-allowed opacity-50'
        )
      )}
      whileHover={reduceMotion || disabled ? {} : { x: 4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!disabled) {
            onClick?.()
          }
        }
      }}
      onClick={onClick}
    >
      {icon && <span className="h-4 w-4 shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </motion.div>
  )
}

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={twMerge(clsx('px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted', className))}>
      {children}
    </div>
  )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div className={twMerge(clsx('my-1 h-px bg-border-soft', className))} role="separator" />
  )
}
