import { forwardRef } from 'react'
import clsx from 'clsx'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDrag' | 'onDragStart' | 'onDragEnd'
>

export interface FormInputProps extends NativeInputProps {
  label: string
  error?: string
  touched?: boolean
  icon?: React.ReactNode
  showSuccess?: boolean
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, touched, icon, showSuccess, className, id, ...props }, ref) => {
    const inputId = id || props.name
    const reduceMotion = useReducedMotion()

    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <motion.label
          htmlFor={inputId}
          className="block text-sm text-muted mb-2"
          initial={reduceMotion ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 }}
        >
          {label}
        </motion.label>
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden="true">
              {icon}
            </div>
          )}
          <motion.input
            ref={ref}
            id={inputId}
            aria-invalid={!!error && touched}
            aria-describedby={error && touched ? `${inputId}-error` : undefined}
            className={clsx(
              'bb-input',
              icon ? 'pl-10 pr-4' : '',
              showSuccess && !error && props.value ? 'pr-10' : '',
              error && touched ? '!border-[rgb(var(--error))]' : '',
              className
            )}
            {...props}
            whileFocus={reduceMotion ? {} : { scale: 1.01 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          />
        </div>
        <AnimatePresence>
          {touched && error && (
            <motion.p
              id={`${inputId}-error`}
              role="alert"
              className="mt-1 text-xs text-red-400"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }
)
