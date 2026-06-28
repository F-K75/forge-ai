import { useState, useCallback, useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

type FieldValues = Record<string, string>

interface ValidationRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: string) => string | undefined
}

type ValidationRules = Record<string, ValidationRule>

interface UseFormValidationOptions {
  rules: ValidationRules
  initialValues?: FieldValues
}

export function useFormValidation({ rules, initialValues = {} }: UseFormValidationOptions) {
  const [values, setValues] = useState<FieldValues>(initialValues)
  const [errors, setErrors] = useState<FieldValues>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const validateField = useCallback((name: string, value: string): string => {
    const rule = rules[name]
    if (!rule) return ''

    if (rule.required && !value) {
      return `${name.charAt(0).toUpperCase() + name.slice(1)} is required`
    }
    
    if (rule.minLength && value.length < rule.minLength) {
      return `${name.charAt(0).toUpperCase() + name.slice(1)} must be at least ${rule.minLength} characters`
    }
    
    if (rule.maxLength && value.length > rule.maxLength) {
      return `${name.charAt(0).toUpperCase() + name.slice(1)} must be at most ${rule.maxLength} characters`
    }
    
    if (rule.pattern && !rule.pattern.test(value)) {
      return `Invalid ${name} format`
    }
    
    if (rule.custom) {
      return rule.custom(value) || ''
    }
    
    return ''
  }, [rules])

  const validateAll = useCallback(() => {
    const newErrors: FieldValues = {}
    let isValid = true
    
    Object.keys(rules).forEach(name => {
      const error = validateField(name, values[name] || '')
      if (error) {
        newErrors[name] = error
        isValid = false
      }
    })
    
    setErrors(newErrors)
    return isValid
  }, [rules, values, validateField])

  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }))
    if (touched[name]) {
      const error = validateField(name, value)
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }, [touched, validateField])

  const handleBlur = useCallback((name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    const error = validateField(name, values[name] || '')
    setErrors(prev => ({ ...prev, [name]: error }))
  }, [values, validateField])

  const isValid = useMemo(() => {
    return Object.keys(rules).every(name => {
      const error = validateField(name, values[name] || '')
      return !error
    })
  }, [rules, values, validateField])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    setLoading(false)
    setSuccess(false)
  }, [initialValues])

  return {
    values,
    errors,
    touched,
    loading,
    success,
    isValid,
    setLoading,
    setSuccess,
    handleChange,
    handleBlur,
    validateAll,
    reset,
  }
}