import type { SelectHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ChevronDown } from 'lucide-react'

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
        <label htmlFor={inputId} className="text-xs font-medium text-ink">
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
            'h-10 w-full appearance-none rounded-md border border-border bg-panel px-3.5 pr-9 text-sm text-ink outline-none transition-all duration-fast focus:border-accent focus:ring-2 focus:ring-accent/20',
            hasError && 'border-error focus:border-error focus:ring-error/20',
            disabled && 'cursor-not-allowed bg-panel-alt opacity-60'
          )}
          {...rest}
        >
          {children}
        </select>
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </div>
      {hint && !hasError && (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  )
}
