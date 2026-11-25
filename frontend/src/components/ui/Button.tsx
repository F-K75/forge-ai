import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export type ButtonVariant = 'primary' | 'secondary' | 'chip' | 'tonal' | 'outlined' | 'ghost' | 'text'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-accent text-white shadow-sm hover:bg-ember-glow active:scale-[0.99]',
  secondary:
    'border border-border bg-panel text-ink shadow-xs hover:bg-panel-alt hover:border-faint active:scale-[0.99]',
  tonal:
    'border border-accent/20 bg-accent/10 text-accent hover:bg-accent/15 active:scale-[0.99]',
  outlined:
    'border border-border bg-transparent text-ink hover:bg-panel-alt hover:border-faint active:scale-[0.99]',
  ghost:
    'border border-transparent bg-transparent text-muted hover:bg-panel-alt hover:text-ink',
  text:
    'bg-transparent text-accent hover:text-ember-glow hover:underline p-0 h-auto min-h-0 border-0 shadow-none',
  chip:
    'border border-border bg-panel text-ink hover:bg-panel-alt hover:border-faint',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-[44px] sm:min-h-[34px] sm:h-8 px-3 text-xs rounded-md',
  md: 'h-10 min-h-[44px] sm:min-h-[38px] sm:h-9 px-4 text-sm rounded-md',
  lg: 'h-11 min-h-[44px] px-5 text-sm rounded-md',
  icon: 'h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] sm:h-9 sm:w-9 p-0 rounded-md',
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
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={twMerge(
        clsx(
          'relative inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-fast ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
      {...rest}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  )
}
