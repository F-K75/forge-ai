import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

export type ButtonVariant = 'primary' | 'secondary' | 'chip'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 align-middle font-medium transition-colors select-none ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary: 'border border-border bg-panel text-ink hover:bg-panel-alt',
  chip: 'border border-border bg-panel text-muted hover:border-accent/40 hover:text-ink',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-sm',
}

/** Shared button. Chip is a pill (full radius); primary/secondary use radius-md. */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={twMerge(clsx(base, variants[variant], sizes[size], className))}
      style={variant === 'chip' ? { borderRadius: 9999, ...style } : { borderRadius: layout.radiusMd, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}