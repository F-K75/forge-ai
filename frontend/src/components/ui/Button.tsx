import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'

export type ButtonVariant = 'primary' | 'secondary' | 'chip' | 'tonal' | 'outlined' | 'ghost' | 'text'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-accent text-[#09090B] font-semibold shadow-m3 hover:bg-ember-glow active:brightness-95',
  secondary: 'border border-border bg-panel-alt text-ink font-medium hover:bg-surface-high hover:border-ink/20 active:bg-surface-high/80',
  tonal: 'border border-accent/25 bg-accent/15 text-accent font-medium hover:bg-accent/25 active:bg-accent/30',
  outlined: 'border border-border bg-transparent text-ink font-medium hover:bg-inlay-hover hover:border-ink/25 active:bg-inlay-strong',
  ghost: 'border border-transparent bg-transparent text-muted font-medium hover:text-ink hover:bg-inlay-hover active:bg-inlay-strong',
  text: 'bg-transparent text-accent font-medium hover:text-ember-glow hover:underline p-0 h-auto border-0 shadow-none',
  chip: 'border border-border bg-panel text-ink font-medium hover:border-accent/50 hover:bg-panel-alt active:bg-surface-high',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-[44px] sm:min-h-[34px] sm:h-8 px-3 text-xs',
  md: 'h-11 min-h-[44px] sm:min-h-[38px] sm:h-9 px-4 text-sm',
  lg: 'h-11 min-h-[44px] px-6 text-base',
  icon: 'h-11 w-11 min-h-[44px] min-w-[44px] sm:h-9 sm:w-9 sm:min-h-[36px] sm:min-w-[36px] p-0',
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
  const isText = variant === 'text'

  return (
    <motion.button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={twMerge(
        clsx(
          'relative inline-flex cursor-pointer select-none items-center justify-center gap-2 overflow-hidden rounded-md transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
      whileTap={reduceMotion || disabled || loading || isText ? {} : { scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeInOut' }}
      {...(rest as any)}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </motion.button>
  )
}
