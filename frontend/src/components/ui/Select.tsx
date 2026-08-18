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
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
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
            'h-12 w-full appearance-none rounded-m3 border bg-panel px-4 py-3 pr-10 text-body text-ink outline-none transition-all duration-fast focus:border-accent/50 focus:shadow-[0_0_0_4px_var(--state-focus)] focus:bg-panel',
            hasError && 'border-error',
            disabled && 'cursor-not-allowed opacity-50'
          )}
          style={{ borderRadius: layout.radiusMd }}
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
