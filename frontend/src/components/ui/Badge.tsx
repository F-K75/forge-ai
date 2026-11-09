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
  default: 'bg-white text-black border-2 border-black shadow-brutal-sm',
  accent: 'bg-[#14B8A6] text-black border-2 border-black shadow-brutal-sm',
  success: 'bg-[#00F59B] text-black border-2 border-black shadow-brutal-sm',
  warning: 'bg-[#FF8A00] text-black border-2 border-black shadow-brutal-sm',
  error: 'bg-[#FF5376] text-black border-2 border-black shadow-brutal-sm',
  info: 'bg-[#00F0FF] text-black border-2 border-black shadow-brutal-sm',
  outlined: 'bg-white text-black border-2 border-black shadow-brutal-sm',
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
          'inline-flex items-center gap-1.5 rounded-sm font-bold uppercase tracking-wider select-none',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
      {...rest}
    >
      {dot && (
        <span
          className="h-2 w-2 rounded-full border border-black bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}
