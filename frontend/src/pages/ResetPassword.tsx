import { useState, useEffect } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Loader2, ArrowRight, AlertCircle, Check } from "lucide-react"

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get("token") || ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing reset token")
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 12) {
      setError("Password must be at least 12 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, new_password: password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || "Failed to reset password")
      }

      setSuccess(true)
      setTimeout(() => navigate("/login", { replace: true }), 2000)
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 rounded-full border border-land-destructive/40 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-4 h-4 text-land-destructive" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Invalid link</h1>
          <p className="text-sm text-land-muted mb-8">
            This password reset link is invalid or has expired.
          </p>
          <Link to="/forgot-password" className="text-sm text-land-ink underline underline-offset-4 hover:text-land-muted transition">
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
          <div className="w-10 h-10 rounded-full border border-land-border flex items-center justify-center mx-auto mb-6">
            <Check className="w-4 h-4 text-land-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Password updated</h1>
          <p className="text-sm text-land-muted">Redirecting you to sign in…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
            <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Reset password
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Set a new password</h1>
          <p className="text-sm text-land-muted mt-2">Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              placeholder="At least 12 characters"
              autoFocus
              className="w-full h-11 px-3 bg-transparent border border-land-border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={12}
              placeholder="Repeat your password"
              className="w-full h-11 px-3 bg-transparent border border-land-border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Updating…
              </>
            ) : (
              <>
                Update password <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-land-muted">
            <Link to="/login" className="text-land-ink hover:underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
