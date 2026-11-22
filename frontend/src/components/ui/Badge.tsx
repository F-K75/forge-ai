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
  default: 'bg-panel-alt text-muted border-border',
  accent: 'bg-accent/10 text-accent border-accent/20',
  success: 'bg-ok/10 text-ok border-ok/20',
  warning: 'bg-warn/10 text-warn border-warn/20',
  error: 'bg-error/10 text-error border-error/20',
  info: 'bg-info/10 text-info border-info/20',
  outlined: 'bg-transparent text-muted border-border',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[11px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-xs',
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
          'inline-flex items-center gap-1.5 rounded-md border font-medium select-none whitespace-nowrap',
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
