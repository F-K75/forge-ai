import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Check } from "lucide-react";
import { useAuthStore } from "../store/authStore";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | undefined {
  if (!value) return "Email is required";
  if (!EMAIL_RE.test(value)) return "Enter a valid email";
  return undefined;
}

function validatePassword(value: string): string | undefined {
  // Login checks an existing password against the server, not a new one --
  // it must never enforce a minimum length here, or raising that minimum
  // (see Signup.tsx/ResetPassword.tsx) would lock out any real account
  // whose already-set password is shorter than the current requirement.
  if (!value) return "Password is required";
  return undefined;
}

type Errors = Partial<Record<"email" | "password" | "form", string>>;

export default function AuthPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const verifyMfa = useAuthStore((s) => s.verifyMfa);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Inline MFA challenge step -- shown in place of the password form once
  // login() reports the account requires a TOTP/backup code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && "mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        return;
      }
      navigate("/projects", { replace: true });
    } catch (err: any) {
      setErrors({ form: err?.response?.data?.detail || "Invalid email or password." });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setMfaError(undefined);
    setLoading(true);
    try {
      await verifyMfa(mfaToken, mfaCode.trim());
      navigate("/projects", { replace: true });
    } catch (err: any) {
      setMfaError(err?.response?.data?.detail || "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 3 : 2;

  return (
    <div className="min-h-screen bg-land-paper text-land-ink">
      <header className="border-b border-land-border/60">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex items-center justify-between h-16">
            <Link to="/home" className="flex items-center gap-2">
              <div className="w-6 h-6 border border-land-ink flex items-center justify-center">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
              </div>
              <span className="font-display font-medium tracking-tight">Forge</span>
            </Link>
            <div className="text-sm text-land-muted">
              New here?{" "}
              <Link to="/signup" className="text-land-ink hover:underline underline-offset-4">
                Create an account
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className="grid lg:grid-cols-2 min-h-[calc(100vh-4rem)]">
        {/* Editorial panel */}
        <aside className="hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-land-border/60">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-land-muted">
            <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" />
            Forge · Console
          </div>
          <div className="max-w-md space-y-8">
            <h1 className="font-display text-4xl xl:text-5xl font-medium leading-[1.05] tracking-tight">
              Ship production software at the speed of thought.
            </h1>
            <p className="text-land-muted leading-relaxed">
              Sign in to orchestrate specialist agents that plan, design, build, and validate your applications
              end-to-end.
            </p>
            <ul className="space-y-3 text-sm">
              {["Six specialized agents, one workspace", "Self-correcting debug loop on every build", "Ship in minutes, not sprints"].map((t) => (
                <li key={t} className="flex items-center gap-3 text-land-muted">
                  <span className="w-5 h-5 rounded-full border border-land-border flex items-center justify-center">
                    <Check className="w-3 h-3 text-land-ink" aria-hidden="true" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-xs text-land-muted/70 font-mono">// forge.ai — build pipeline</div>
        </aside>

        {/* Form */}
        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-10">
              <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
                <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Sign in
              </div>
              <h2 className="font-display text-3xl font-medium tracking-tight">Welcome back</h2>
              <p className="text-sm text-land-muted mt-2">Enter your credentials to access your workspace.</p>
            </div>

            {mfaToken ? (
              <form onSubmit={handleMfaSubmit} noValidate className="space-y-5">
                <p className="text-sm text-land-muted">
                  Enter the 6-digit code from your authenticator app, or one of your backup codes.
                </p>
                {mfaError && (
                  <div role="alert" className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{mfaError}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="mfa-code" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Authentication code
                  </label>
                  <input
                    id="mfa-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    autoFocus
                    className="w-full h-11 px-3 bg-transparent border border-land-border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition tracking-widest"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !mfaCode.trim()}
                  className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Verifying…
                    </>
                  ) : (
                    <>
                      Verify <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaToken(null);
                    setMfaCode("");
                    setMfaError(undefined);
                  }}
                  className="w-full text-xs text-land-muted hover:text-land-ink transition"
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <>
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {errors.form && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{errors.form}</span>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (touched.email) setErrors((er) => ({ ...er, email: validateEmail(e.target.value) }));
                  }}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, email: true }));
                    setErrors((er) => ({ ...er, email: validateEmail(email) }));
                  }}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={`w-full h-11 px-3 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                    errors.email ? "border-land-destructive/60" : "border-land-border"
                  }`}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-land-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs text-land-muted hover:text-land-ink transition">
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (touched.password) setErrors((er) => ({ ...er, password: validatePassword(e.target.value) }));
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, password: true }));
                      setErrors((er) => ({ ...er, password: validatePassword(password) }));
                    }}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    className={`w-full h-11 pl-3 pr-10 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                      errors.password ? "border-land-destructive/60" : "border-land-border"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-land-muted hover:text-land-ink transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                {errors.password ? (
                  <p id="password-error" className="text-xs text-land-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.password}
                  </p>
                ) : (
                  <div className="flex gap-1 pt-1" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`h-0.5 flex-1 rounded-full transition-colors ${
                          i < passwordStrength
                            ? passwordStrength === 1
                              ? "bg-land-destructive/70"
                              : passwordStrength === 2
                              ? "bg-yellow-500/70"
                              : "bg-land-accent"
                            : "bg-land-border"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-land-muted select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-land-border bg-transparent accent-land-ink"
                />
                Keep me signed in for 30 days
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-xs text-land-muted text-center leading-relaxed">
              By continuing you agree to Forge's Terms and Privacy Policy.
            </p>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
