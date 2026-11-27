import { useState, useEffect } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Loader2, ArrowRight, AlertCircle, Check } from "lucide-react"
import BrandLogo from "../components/BrandLogo"
import { motion } from "motion/react"
import { presets } from "../lib/animationPresets"
import { shouldReduceMotion } from "../lib/animations"
import { validateNewPassword } from "../lib/passwordPolicy"

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get("token") || ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const reduce = shouldReduceMotion()

  useEffect(() => {
    if (!token) {
      setError("This reset link is invalid or has expired.")
    }
  }, [token])

  const pageMotion = reduce ? {} : presets.pageTransition

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const passwordError = validateNewPassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirm) {
      setError("The passwords you entered don't match")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, new_password: password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || "We couldn't reset your password. Please try again.")
      }

      setSuccess(true)
      setTimeout(() => navigate("/login", { replace: true }), 2000)
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="relative isolate overflow-hidden min-h-screen bg-base text-ink flex items-center justify-center p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 ember-atmosphere opacity-90" />
        <motion.div {...pageMotion} className="w-full max-w-sm text-center relative rounded-2xl border border-glass-strong-border bg-glass-strong p-6 sm:p-8 backdrop-blur-xl">
          <div className="w-10 h-10 rounded-full border border-error/40 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-4 h-4 text-error" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Invalid link</h1>
          <p className="text-sm text-muted mb-8">
            This password reset link is invalid or has expired. Please request a new one below.
          </p>
          <Link to="/forgot-password" className="text-sm text-ink underline underline-offset-4 hover:text-muted transition">
            Request new link
          </Link>
        </motion.div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="relative isolate overflow-hidden min-h-screen bg-base text-ink flex items-center justify-center p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 ember-atmosphere opacity-90" />
        <motion.div {...pageMotion} className="w-full max-w-sm text-center relative rounded-2xl border border-glass-strong-border bg-glass-strong p-6 sm:p-8 backdrop-blur-xl" role="status" aria-live="polite">
          <div className="mb-6 inline-flex items-center justify-center">
            <BrandLogo size="lg" />
          </div>
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center mx-auto mb-6">
            <Check className="w-4 h-4 text-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Password updated</h1>
          <p className="text-sm text-muted">Redirecting to sign in…</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative isolate overflow-hidden min-h-screen bg-base text-ink flex items-center justify-center p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 ember-atmosphere opacity-90" />
      <motion.div {...pageMotion} className="w-full max-w-sm relative rounded-2xl border border-glass-strong-border bg-glass-strong p-6 sm:p-8 backdrop-blur-xl">
        <div className="mb-8">
          <Link to="/home" className="inline-flex items-center gap-2.5 mb-6 hover:opacity-85 transition">
            <BrandLogo size="sm" />
            <span className="font-brand text-base font-semibold tracking-tight text-ink">Forge</span>
          </Link>
          <div className="text-xs uppercase tracking-[0.18em] text-muted mb-4 flex items-center gap-2">
            <span className="w-6 h-px bg-muted/50" aria-hidden="true" /> Reset password
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted mt-2">Set a strong password to keep your account secure.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-muted">
              New password
            </label>
            <p className="text-xs text-muted -mt-1">
              12+ characters, including uppercase, lowercase, a number, and a symbol.
            </p>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              placeholder="Create a new password"
              autoFocus
              className="w-full h-11 px-3 bg-transparent border border-border rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="block text-xs uppercase tracking-[0.14em] text-muted">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={12}
              placeholder="Confirm your password"
              className="w-full h-11 px-3 bg-transparent border border-border rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
            />
          </div>

          <motion.button
            type="submit"
            disabled={loading || !token}
            {...(reduce ? {} : presets.button)}
            className="w-full h-11 rounded-pill bg-ink text-on-ink text-sm font-medium hover:bg-ink/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Updating…
              </>
            ) : (
              <>
                Save new password <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </>
            )}
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
