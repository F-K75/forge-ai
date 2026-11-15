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
        <label htmlFor={inputId} className="text-xs font-medium text-muted tracking-wide">
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
            'h-11 sm:h-10 w-full appearance-none rounded-md border border-border bg-panel px-3.5 py-2 pr-10 text-sm text-ink outline-none transition-all duration-150 ease-in-out font-medium hover:border-ink/20 focus:border-accent focus:bg-panel-alt focus:ring-2 focus:ring-accent/25',
            hasError && 'border-error focus:border-error focus:ring-error/25',
            disabled && 'cursor-not-allowed bg-panel-alt opacity-50'
          )}
          style={{ borderRadius: layout.radiusSm }}
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
