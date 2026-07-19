import { useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { motion } from 'motion/react'
import { FormInput, type FormInputProps } from './FormInput'

type PasswordInputProps = Omit<FormInputProps, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className="relative">
        <FormInput
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          {...props}
        />
        <motion.button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink focus:text-ink"
          tabIndex={-1}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <motion.div
            key={showPassword ? "eye-off" : "eye"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </motion.div>
        </motion.button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
