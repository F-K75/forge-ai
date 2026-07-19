import { forwardRef } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDrag' | 'onDragStart' | 'onDragEnd'
>

interface LoadingButtonProps extends NativeButtonProps {
  loading?: boolean
  success?: boolean
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, success, children, className, disabled, ...props }, ref) => {
    const reduceMotion = useReducedMotion()

    return (
      <motion.button
        ref={ref}
        disabled={disabled || loading || success}
        aria-disabled={loading || success || disabled}
        className={clsx(
          'w-full text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent',
          success ? 'bg-ok' : 'bg-accent hover:bg-accent/90 disabled:bg-accent/50',
          loading && 'cursor-wait',
          className
        )}
        {...props}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={reduceMotion || disabled || loading || success ? {} : { scale: 1.02 }}
        whileTap={reduceMotion || disabled || loading || success ? {} : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {success ? (
          <motion.span
            className="flex items-center gap-2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Done
          </motion.span>
        ) : loading ? (
          <motion.span
            className="flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.span
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            />
            Loading...
          </motion.span>
        ) : (
          children
        )}
      </motion.button>
    )
  }
)

LoadingButton.displayName = 'LoadingButton'
