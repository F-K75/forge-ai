import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'outlined'
export type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  children: ReactNode
  dot?: boolean
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-panel-alt text-ink border border-border',
  accent: 'bg-accent/15 text-accent border border-accent/25',
  success: 'bg-ok/15 text-ok border border-ok/25',
  warning: 'bg-warn/15 text-warn border border-warn/25',
  error: 'bg-error/15 text-error border border-error/25',
  info: 'bg-info/15 text-info border border-info/25',
  outlined: 'bg-transparent text-muted border border-border',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
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
          'inline-flex items-center gap-1.5 rounded-sm font-medium tracking-wide select-none transition-colors duration-150',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
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
