import { type InputHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className, ...props }, ref) => {
    return (
      <label className={twMerge(clsx('flex items-start gap-3 cursor-pointer select-none', className))}>
        <div className="relative mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div
            className={clsx(
              'h-7 w-12 rounded-sm border-2 border-black bg-white shadow-brutal-sm transition-colors duration-fast',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-black peer-focus-visible:ring-offset-2',
              props.checked && 'bg-brutal-yellow'
            )}
          >
            <div
              className={clsx(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-sm border-2 border-black bg-black transition-transform duration-fast',
                props.checked ? 'translate-x-5 bg-black' : 'bg-neutral-300'
              )}
            />
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && <span className="text-xs font-bold uppercase tracking-wider text-ink">{label}</span>}
            {description && <span className="text-xs font-medium text-muted">{description}</span>}
          </div>
        )}
      </label>
    )
  }
)

Switch.displayName = 'Switch'
