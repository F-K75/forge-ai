import type { HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

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
    const reduceMotion = useReducedMotion()
    const inputId = id || props.name
    const hasError = Boolean(error)
    const isTextarea = props.as === 'textarea'

    return (
      <motion.div
        className={clsx('flex flex-col gap-1.5', fullWidth && 'w-full', className)}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-muted tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true">
              {leftIcon}
            </span>
          )}
          {isTextarea ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              id={inputId}
              aria-invalid={hasError}
              aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              className={clsx(
                'w-full rounded-md border border-border bg-panel px-3.5 py-2.5 text-sm text-ink outline-none transition-all duration-150 ease-in-out placeholder:text-faint hover:border-ink/20 focus:border-accent focus:bg-panel-alt focus:ring-2 focus:ring-accent/25',
                leftIcon && 'pl-10',
                rightIcon && 'pr-10',
                hasError && 'border-error focus:border-error focus:ring-error/25',
                props.disabled && 'cursor-not-allowed bg-panel-alt opacity-50',
                className
              )}
              style={{ borderRadius: layout.radiusSm, minHeight: 120 }}
              {...props as TextareaHTMLAttributes<HTMLTextAreaElement>}
            />
          ) : (
            <input
              ref={ref as React.Ref<HTMLInputElement>}
              id={inputId}
              aria-invalid={hasError}
              aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
              className={clsx(
                'h-11 sm:h-10 w-full rounded-md border border-border bg-panel px-3.5 py-2 text-sm text-ink outline-none transition-all duration-150 ease-in-out placeholder:text-faint hover:border-ink/20 focus:border-accent focus:bg-panel-alt focus:ring-2 focus:ring-accent/25',
                leftIcon && 'pl-10',
                rightIcon && 'pr-10',
                hasError && 'border-error focus:border-error focus:ring-error/25',
                props.disabled && 'cursor-not-allowed bg-panel-alt opacity-50',
                className
              )}
              style={{ borderRadius: layout.radiusSm }}
              {...props as InputHTMLAttributes<HTMLInputElement>}
            />
          )}
          {rightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
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
          <motion.p
            id={`${inputId}-error`}
            role="alert"
            className="text-xs text-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    )
  }
)

InputComponent.displayName = 'Input'

export { InputComponent as Input }
