import { forwardRef } from 'react'
import clsx from 'clsx'

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  touched?: boolean
  icon?: React.ReactNode
  showSuccess?: boolean
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, touched, icon, showSuccess, className, id, ...props }, ref) => {
    const inputId = id || props.name

    return (
      <div>
        <label htmlFor={inputId} className="block text-sm text-forge-text-secondary mb-2">{label}</label>
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-muted" aria-hidden="true">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error && touched}
            aria-describedby={error && touched ? `${inputId}-error` : undefined}
            className={clsx(
              'w-full bg-forge-bg border rounded-xl py-3 text-white placeholder-forge-muted focus:outline-none focus:ring-2 transition',
              icon ? 'pl-10 pr-4' : 'px-4',
              showSuccess && !error && props.value ? 'pr-10' : '',
              error && touched ? 'border-red-500 focus:ring-red-500' : 'border-forge-border focus:ring-violet-500',
              className
            )}
            {...props}
          />
        </div>
        {touched && error && (
          <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

FormInput.displayName = 'FormInput'