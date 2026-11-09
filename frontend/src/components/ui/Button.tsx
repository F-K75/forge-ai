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
  primary: 'border-2 border-black bg-brutal-yellow text-black shadow-brutal font-bold hover:bg-[#2DD4BF] active:translate-x-[2px] active:translate-y-[2px] active:shadow-brutal-press',
  secondary: 'border-2 border-black bg-white text-black shadow-brutal font-bold hover:bg-brutal-cream active:translate-x-[2px] active:translate-y-[2px] active:shadow-brutal-press',
  tonal: 'border-2 border-black bg-brutal-cyan text-black shadow-brutal font-bold hover:bg-[#54A0FF] active:translate-x-[2px] active:translate-y-[2px] active:shadow-brutal-press',
  outlined: 'border-2 border-black bg-white text-black shadow-brutal font-bold hover:bg-brutal-yellow active:translate-x-[2px] active:translate-y-[2px] active:shadow-brutal-press',
  ghost: 'border-2 border-transparent hover:border-black bg-transparent text-ink font-bold hover:bg-black/5 active:translate-x-[1px] active:translate-y-[1px]',
  text: 'bg-transparent text-ink font-bold hover:underline p-0 h-auto border-0 shadow-none',
  chip: 'border-2 border-black bg-white text-black shadow-brutal-sm font-bold hover:bg-brutal-yellow active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-[44px] sm:min-h-[36px] sm:h-9 px-3 text-xs',
  md: 'h-11 min-h-[44px] sm:min-h-[40px] sm:h-10 px-5 text-sm',
  lg: 'h-12 min-h-[44px] px-7 text-base',
  icon: 'h-11 w-11 min-h-[44px] min-w-[44px] p-0',
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
      className={twMerge(
        clsx(
          'relative inline-flex cursor-pointer select-none items-center justify-center gap-2 overflow-hidden font-bold transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none rounded-sm',
          variantClasses[variant],
          sizeClasses[size],
          className
        )
      )}
      whileHover={reduceMotion || disabled || isText ? {} : { x: -1, y: -1 }}
      whileTap={reduceMotion || disabled || isText ? {} : { x: 2, y: 2 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      {...(rest as any)}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {children}
    </motion.button>
  )
}
