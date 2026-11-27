import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import { api } from '../lib/api'
import { motion } from 'motion/react'
import { presets } from '../lib/animationPresets'
import { shouldReduceMotion } from '../lib/animations'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const validateEmail = (value: string) => {
    if (!value) return 'Please enter your email.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address.'
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const err = validateEmail(email)
    setEmailError(err)
    if (err) return
    setLoading(true)
    try {
      await api.post('/v1/auth/forgot-password', { email })
      setSubmitted(true)
    } catch (_err: unknown) {
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  const reduce = shouldReduceMotion()

  if (submitted) {
    return (
      <div className="relative isolate overflow-hidden min-h-screen bg-base text-ink flex items-center justify-center p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 ember-atmosphere opacity-90" />
        <motion.div
          {...(reduce ? {} : presets.pageTransition)}
          className="w-full max-w-sm text-center relative rounded-2xl border border-glass-strong-border bg-glass-strong p-6 sm:p-8 backdrop-blur-xl"
        >
          <div className="mb-6 inline-flex items-center justify-center">
            <BrandLogo size="lg" />
          </div>
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center mx-auto mb-6">
            <Mail className="w-4 h-4 text-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Check your email</h1>
          <p className="text-sm text-muted mb-8">If an account with that email exists, we&apos;ve sent a reset link.</p>
          <Link to="/login" className="text-sm text-ink underline underline-offset-4 hover:text-muted transition">
            Back to sign in
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative isolate overflow-hidden min-h-screen bg-base text-ink flex items-center justify-center p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 ember-atmosphere opacity-90" />
      <motion.div
        {...(reduce ? {} : presets.pageTransition)}
        className="w-full max-w-sm relative rounded-2xl border border-glass-strong-border bg-glass-strong p-6 sm:p-8 backdrop-blur-xl"
      >
        <div className="mb-8">
          <Link to="/home" className="inline-flex items-center gap-2.5 mb-6 hover:opacity-85 transition">
            <BrandLogo size="sm" />
            <span className="font-brand text-base font-semibold tracking-tight text-ink">Forge</span>
          </Link>
          <div className="text-xs uppercase tracking-[0.18em] text-muted mb-4 flex items-center gap-2">
            <span className="w-6 h-px bg-muted/50" aria-hidden="true" /> Reset password
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Forgot your password?</h1>
          <p className="text-sm text-muted mt-2">Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {emailError && touched && (
            <div id="forgot-email-error" role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
              <span>{emailError}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="reset-email" className="block text-xs uppercase tracking-[0.14em] text-muted">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={!!(emailError && touched)}
              aria-describedby={(emailError && touched) ? "forgot-email-error" : undefined}
              required
              autoComplete="email"
              autoFocus
              className={`w-full h-11 px-3 bg-transparent border rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition ${
                emailError && touched ? 'border-error/60' : 'border-border'
              }`}
            />
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            {...(reduce ? {} : presets.button)}
            className="w-full h-11 rounded-pill bg-ink text-on-ink text-sm font-medium hover:bg-ink/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </motion.button>

          <p className="text-center text-sm text-muted">
            <Link to="/login" className="text-ink hover:underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  )
}
