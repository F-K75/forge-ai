import { useState, useEffect, useCallback } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Loader2, ArrowRight, AlertCircle, Check, Mail } from "lucide-react"
import { motion } from "motion/react"
import { presets } from "../lib/animationPresets"
import { shouldReduceMotion } from "../lib/animations"

type Status = "verifying" | "success" | "error"

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get("token") || ""

  const [status, setStatus] = useState<Status>(token ? "verifying" : "error")
  const [resendEmail, setResendEmail] = useState("")
  const [resendSent, setResendSent] = useState(false)
  const [resending, setResending] = useState(false)
  const reduce = shouldReduceMotion()
  const pageMotion = reduce ? {} : presets.pageTransition

  useEffect(() => {
    if (!token) return
    let cancelled = false

    fetch(`/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: "GET",
      credentials: "include",
    })
      .then((res) => {
        if (cancelled) return
        setStatus(res.ok ? "success" : "error")
        if (res.ok) {
          setTimeout(() => navigate("/", { replace: true }), 2000)
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleResend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!resendEmail) return
      setResending(true)
      try {
        await fetch("/v1/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: resendEmail }),
        })
      } finally {
        setResending(false)
        setResendSent(true)
      }
    },
    [resendEmail]
  )

  if (status === "verifying") {
    return (
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <motion.div {...pageMotion} className="w-full max-w-sm text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-6 text-land-muted" aria-hidden="true" />
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Verifying your email…</h1>
          <p className="text-sm text-land-muted">Almost done.</p>
        </motion.div>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <motion.div {...pageMotion} className="w-full max-w-sm text-center" role="status" aria-live="polite">
          <div className="w-10 h-10 rounded-full border border-land-border flex items-center justify-center mx-auto mb-6">
            <Check className="w-4 h-4 text-land-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Email verified</h1>
          <p className="text-sm text-land-muted">Redirecting to Forge…</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
      <motion.div {...pageMotion} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-full border border-land-destructive/40 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-4 h-4 text-land-destructive" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">
            {token ? "Invalid or expired link" : "Missing verification link"}
          </h1>
          <p className="text-sm text-land-muted">
            {token
              ? "This verification link is invalid or has expired. Request a new one below."
              : "Open the verification link from your email, or request a new one below."}
          </p>
        </div>

        {resendSent ? (
          <p className="text-center text-sm text-land-muted" role="status" aria-live="polite">
            If an account exists for that email, a new verification link is on its way.
          </p>
        ) : (
          <form onSubmit={handleResend} noValidate className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="resend-email" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                Email
              </label>
              <input
                id="resend-email"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                placeholder="you@example.com"
                autoFocus
                className="w-full h-11 px-3 bg-transparent border border-land-border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition"
              />
            </div>

          <motion.button
            type="submit"
            disabled={resending || !resendEmail}
            {...(reduce ? {} : presets.button)}
            className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 group"
          >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Sending…
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  Resend verification email
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </>
              )}
            </motion.button>
          </form>
        )}

        <p className="text-center text-sm text-land-muted mt-6">
          <Link to="/login" className="text-land-ink hover:underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
