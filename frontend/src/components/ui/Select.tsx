import type { HTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Select({ label, hint, error, children, className, id, name, disabled, ...rest }: SelectProps) {
  const inputId = id || name
  const hasError = Boolean(error)

  return (
    <div className={twMerge(clsx('flex flex-col gap-1.5 w-full', className))}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-bold text-ink uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          disabled={disabled}
          className={clsx(
            'h-12 w-full appearance-none rounded-sm border-2 border-black bg-white px-4 py-3 pr-10 text-body text-ink outline-none transition-all duration-fast font-bold shadow-brutal-sm focus:shadow-brutal focus:border-black focus:bg-white',
            hasError && 'border-error shadow-[2px_2px_0px_0px_#FF5376] focus:shadow-[4px_4px_0px_0px_#FF5376]',
            disabled && 'cursor-not-allowed bg-neutral-100 opacity-60 shadow-none'
          )}
          style={{ borderRadius: layout.radiusSm }}
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-black" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </div>
      {hint && !hasError && (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}
