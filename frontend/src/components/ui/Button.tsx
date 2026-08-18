import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

export type ButtonVariant = 'primary' | 'secondary' | 'chip' | 'tonal' | 'outlined' | 'ghost' | 'text'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90 shadow-apple',
  secondary: 'border border-border bg-panel text-ink hover:bg-panel-alt shadow-apple',
  tonal: 'bg-accent-soft text-accent hover:bg-accent-soft/80',
  outlined: 'border border-border bg-transparent text-ink hover:bg-inlay',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-inlay',
  text: 'bg-transparent text-accent hover:bg-inlay p-0 h-auto',
  chip: 'border border-border bg-panel text-muted hover:border-accent/40 hover:text-ink',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-base',
  icon: 'h-10 w-10 p-0',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  type = 'button',
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const reduceMotion = useReducedMotion()
  const isChip = variant === 'chip'
  const isText = variant === 'text'
  const isIcon = size === 'icon'

  return (
    <motion.button
      type={type}
      disabled={disabled || loading}
      className={twMerge(
        clsx(
          'relative inline-flex cursor-pointer select-none items-center justify-center gap-2 overflow-hidden font-medium transition-all duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          (isChip || isIcon) && 'rounded-full',
          !isChip && !isIcon && 'rounded-full',
          className
        )
      )}
      style={!isChip && !isIcon ? { borderRadius: layout.radiusMd } : undefined}
      whileHover={reduceMotion || disabled ? {} : { y: -1 }}
      whileTap={reduceMotion || disabled ? {} : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      {...(rest as any)}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </motion.button>
  )
}
