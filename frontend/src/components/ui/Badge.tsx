import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outlined'
export type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  children: ReactNode
  dot?: boolean
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-panel-alt text-muted border-border',
  success: 'bg-ok/15 text-ok border-ok/20',
  warning: 'bg-warn/15 text-warn border-warn/20',
  error: 'bg-error/15 text-error border-error/20',
  info: 'bg-info/15 text-info border-info/20',
  outlined: 'bg-transparent text-ink border-outline',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
}

export function Badge({
  variant = 'default',
  size = 'md',
  children,
  dot = false,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 rounded-full border font-medium',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
      style={{ borderRadius: layout.radiusFull, ...rest.style }}
      {...rest}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
