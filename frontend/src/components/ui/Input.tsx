import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface BaseInputProps {
  label?: string
  hint?: string
  error?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

interface InputProps extends BaseInputProps, InputHTMLAttributes<HTMLInputElement> {
  as?: 'input'
}

interface TextareaProps extends BaseInputProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  as: 'textarea'
}

type InputFieldProps = InputProps | TextareaProps

const InputComponent = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputFieldProps>(
  ({ label, hint, error, leftIcon, rightIcon, fullWidth = true, className, id, ...props }, ref) => {
    const inputId = id || props.name
    const hasError = Boolean(error)
    const isTextarea = props.as === 'textarea'

    const baseFieldClasses = clsx(
      'w-full rounded-md border border-border bg-panel px-3.5 text-sm text-ink outline-none transition-all duration-fast placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20',
      leftIcon && 'pl-10',
      rightIcon && 'pr-10',
      hasError && 'border-error focus:border-error focus:ring-error/20',
      props.disabled && 'cursor-not-allowed bg-panel-alt opacity-60'
    )

    return (
      <div className={twMerge(clsx('flex flex-col gap-1.5', fullWidth && 'w-full', className))}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}
          {isTextarea ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              id={inputId}
              aria-invalid={hasError}
              aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              className={clsx(baseFieldClasses, 'min-h-[112px] py-2.5 resize-y')}
              {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            />
          ) : (
            <input
              ref={ref as React.Ref<HTMLInputElement>}
              id={inputId}
              aria-invalid={hasError}
              aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              className={clsx(baseFieldClasses, 'h-10 py-2')}
              {...(props as InputHTMLAttributes<HTMLInputElement>)}
            />
          )}
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              {rightIcon}
            </span>
          )}
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
)

InputComponent.displayName = 'Input'

export { InputComponent as Input }
