import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  Terminal,
  Bot,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuthStore, API_URL } from "../store/authStore";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";

const easeOut = [0.16, 1, 0.3, 1] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | undefined {
  if (!value) return "Please enter your email.";
  if (!EMAIL_RE.test(value)) return "Please enter a valid email address.";
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (!value) return "Please enter your password.";
  return undefined;
}

type Errors = Partial<Record<"email" | "password" | "form", string>>;

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

const AGENT_PIPELINE = [
  {
    role: "Product Lead",
    action: "Scope decomposed into 14 user stories & acceptance criteria",
    badge: "PRD Ready",
    color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    dotColor: "bg-amber-500",
  },
  {
    role: "System Architect",
    action: "PostgreSQL schemas & API boundaries validated",
    badge: "Topology Verified",
    color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    dotColor: "bg-blue-500",
  },
  {
    role: "Fullstack Engineer",
    action: "Synthesizing typed React client & service layer",
    badge: "12 files emitted",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    dotColor: "bg-emerald-500",
  },
  {
    role: "Security & QA",
    action: "Zero high CVEs detected • 100% test pass rate",
    badge: "Audit Passed",
    color: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
    dotColor: "bg-purple-500",
  },
];

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
  const [capsLockActive, setCapsLockActive] = useState(false);

  // Inline MFA challenge state
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | undefined>();

  const loginShake = useAnimationControls();
  const mfaShake = useAnimationControls();

  useEffect(() => {
    if (errors.form) {
      loginShake.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.35, ease: easeOut },
      });
    }
  }, [errors.form, loginShake]);

  useEffect(() => {
    if (mfaError) {
      mfaShake.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.35, ease: easeOut },
      });
    }
  }, [mfaError, mfaShake]);

  const handleKeyModifier = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
  };

  const handleQuickDemoFill = () => {
    setEmail("demo@forge.ai");
    setPassword("DemoPass123!");
    setErrors({});
  };

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
      setErrors({
        form:
          err?.response?.data?.detail ||
          "The email or password you entered is incorrect. Please try again or reset your password.",
      });
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
      setMfaError(
        err?.response?.data?.detail || "The code you entered is invalid. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength =
    password.length === 0
      ? 0
      : password.length < 8
      ? 1
      : /[A-Z]/.test(password) && /[0-9]/.test(password)
      ? 3
      : 2;

  const strengthLabels = ["", "Fair", "Good", "Strong"];

  const emailErrorId = errors.email ? "email-error" : undefined;
  const passwordErrorId = errors.password ? "password-error" : undefined;
  const formErrorId = errors.form ? "form-error" : undefined;
  const mfaErrorId = mfaError ? "mfa-error" : undefined;

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col selection:bg-accent/20">
      {/* Top Header Navigation */}
      <motion.header
        id="auth-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="w-full border-b border-border bg-panel/80 backdrop-blur-md sticky top-0 z-40 transition-colors"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            id="auth-brand-logo"
            to="/home"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg p-1"
          >
            <BrandLogo size="md" bordered />
            <div className="flex flex-col">
              <span className="font-display text-base font-semibold tracking-tight text-ink">
                Forge AI
              </span>
              <span className="text-[11px] font-mono tracking-wider uppercase text-muted">
                Engineering OS
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-high border border-border text-xs text-muted font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Network: Operational</span>
            </div>

            <ThemeToggle compact className="border border-border" />

            <div className="h-4 w-px bg-border hidden sm:block" aria-hidden="true" />

            <div className="text-xs text-muted">
              Don&apos;t have an account?{" "}
              <Link
                id="auth-nav-signup-link"
                to="/signup"
                className="font-medium text-ink hover:underline underline-offset-4 transition"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content Layout */}
      <main
        id="auth-main-container"
        className="flex-1 max-w-7xl w-full mx-auto grid lg:grid-cols-12 min-h-[calc(100vh-4rem)]"
      >
        {/* Left Column: Form Section */}
        <section className="lg:col-span-6 xl:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <motion.div
            id="auth-form-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="w-full max-w-md bg-panel border border-border rounded-2xl p-8 sm:p-10 shadow-apple transition-all"
          >
            {/* Header / Intro */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-high border border-border text-[11px] font-mono font-medium tracking-wide uppercase text-muted mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Enterprise Workspace Access</span>
              </div>
              <h1 id="auth-heading" className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
                Welcome back
              </h1>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                Sign in to your autonomous engineering fleet and ongoing builds.
              </p>
            </div>

            {/* Quick Demo Fill Helper */}
            <div className="mb-6 p-3 rounded-xl bg-panel-alt border border-border/80 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted">
                <Sparkles className="w-4 h-4 text-accent shrink-0" />
                <span>Evaluating Forge?</span>
              </div>
              <button
                id="auth-demo-fill-btn"
                type="button"
                onClick={handleQuickDemoFill}
                className="font-medium text-accent hover:underline whitespace-nowrap"
              >
                Auto-fill demo account
              </button>
            </div>

            {/* Form Switching (Standard login vs. MFA) */}
            <AnimatePresence mode="wait" initial={false}>
              {mfaToken ? (
                /* MFA Challenge Form */
                <motion.form
                  key="mfa"
                  id="mfa-form"
                  onSubmit={handleMfaSubmit}
                  noValidate
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.2, ease: easeOut } }}
                  transition={{ duration: 0.35, ease: easeOut }}
                  className="space-y-5"
                >
                  <motion.div animate={mfaShake} className="space-y-5">
                    <div className="p-3.5 rounded-xl bg-surface-high border border-border text-xs text-muted leading-relaxed">
                      Two-factor authentication is active on your workspace. Enter the 6-digit verification code from your authenticator application.
                    </div>

                    <AnimatePresence>
                      {mfaError && (
                        <motion.div
                          id="mfa-error"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: easeOut }}
                          role="alert"
                          aria-live="assertive"
                          className="flex items-start gap-2.5 rounded-xl border border-error/40 bg-error/10 p-3.5 text-sm text-error overflow-hidden"
                        >
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{mfaError}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-2">
                      <label
                        htmlFor="mfa-code"
                        className="block text-xs font-mono uppercase tracking-wider text-muted"
                      >
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
                        onBlur={() => setTouched((t) => ({ ...t, mfaCode: true }))}
                        aria-invalid={!!mfaError}
                        aria-describedby={mfaErrorId}
                        autoFocus
                        className="bb-input font-mono tracking-widest text-center text-lg h-12"
                      />
                    </div>

                    <button
                      id="mfa-submit-btn"
                      type="submit"
                      disabled={loading || !mfaCode.trim()}
                      className="bb-btn bb-btn-primary w-full h-11"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          <span>Verifying token…</span>
                        </>
                      ) : (
                        <>
                          <span>Verify & Proceed</span>
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </>
                      )}
                    </button>

                    <button
                      id="mfa-back-btn"
                      type="button"
                      onClick={() => {
                        setMfaToken(null);
                        setMfaCode("");
                        setMfaError(undefined);
                      }}
                      className="w-full text-xs text-muted hover:text-ink transition py-1 text-center"
                    >
                      Return to primary sign in
                    </button>
                  </motion.div>
                </motion.form>
              ) : (
                /* Standard Credentials Form */
                <motion.form
                  key="login"
                  id="auth-form"
                  aria-describedby={formErrorId}
                  onSubmit={handleSubmit}
                  noValidate
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.2, ease: easeOut } }}
                  transition={{ duration: 0.35, ease: easeOut }}
                  className="space-y-5"
                >
                  <motion.div animate={loginShake} className="space-y-5">
                    {/* Top Level Form Error */}
                    <AnimatePresence>
                      {errors.form && (
                        <motion.div
                          id="form-error"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: easeOut }}
                          role="alert"
                          aria-live="assertive"
                          className="flex items-start gap-2.5 rounded-xl border border-error/40 bg-error/10 p-3.5 text-sm text-error overflow-hidden"
                        >
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          <span className="leading-snug">{errors.form}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Email Input Field */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="email"
                        className="block text-xs font-mono uppercase tracking-wider text-muted"
                      >
                        Email
                      </label>
                      <div className="relative">
                        <input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="developer@forge.ai"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (touched.email) {
                              setErrors((er) => ({ ...er, email: validateEmail(e.target.value) }));
                            }
                          }}
                          onBlur={() => {
                            setTouched((t) => ({ ...t, email: true }));
                            setErrors((er) => ({ ...er, email: validateEmail(email) }));
                          }}
                          aria-invalid={!!errors.email}
                          aria-describedby={emailErrorId}
                          className={`bb-input h-11 pl-10 pr-4 ${
                            errors.email ? "!border-[rgb(var(--error))]" : ""
                          }`}
                        />
                        <Mail
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none"
                          aria-hidden="true"
                        />
                      </div>
                      <AnimatePresence>
                        {errors.email && (
                          <motion.p
                            id="email-error"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="text-xs text-error flex items-center gap-1.5 pt-0.5"
                          >
                            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{errors.email}</span>
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Password Input Field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="password"
                          className="block text-xs font-mono uppercase tracking-wider text-muted"
                        >
                          Password
                        </label>
                        <Link
                          to="/forgot-password"
                          className="text-xs text-muted hover:text-ink transition underline-offset-2 hover:underline"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••••••"
                          value={password}
                          onKeyDown={handleKeyModifier}
                          onKeyUp={handleKeyModifier}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (touched.password) {
                              setErrors((er) => ({
                                ...er,
                                password: validatePassword(e.target.value),
                              }));
                            }
                          }}
                          onBlur={() => {
                            setTouched((t) => ({ ...t, password: true }));
                            setErrors((er) => ({
                              ...er,
                              password: validatePassword(password),
                            }));
                          }}
                          aria-invalid={!!errors.password}
                          aria-describedby={passwordErrorId}
                          className={`bb-input h-11 pl-10 pr-10 ${
                            errors.password ? "!border-[rgb(var(--error))]" : ""
                          }`}
                        />
                        <Lock
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none"
                          aria-hidden="true"
                        />
                        <button
                          id="password-visibility-toggle"
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-ink transition rounded-md"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>

                      {/* Caps Lock Indicator */}
                      {capsLockActive && (
                        <p
                          id="caps-lock-warning"
                          className="text-2xs font-mono text-warn flex items-center gap-1 pt-0.5"
                        >
                          <AlertCircle className="w-3 h-3" /> Caps Lock is on
                        </p>
                      )}

                      {/* Error or Strength Bar */}
                      <AnimatePresence mode="wait">
                        {errors.password ? (
                          <motion.p
                            key="error"
                            id="password-error"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="text-xs text-error flex items-center gap-1.5 pt-0.5"
                          >
                            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{errors.password}</span>
                          </motion.p>
                        ) : password.length > 0 ? (
                          <div key="strength" className="pt-1.5 space-y-1">
                            <div className="flex gap-1.5" aria-hidden="true">
                              {[1, 2, 3].map((step) => (
                                <div
                                  key={step}
                                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                                    passwordStrength >= step
                                      ? passwordStrength === 1
                                        ? "bg-error"
                                        : passwordStrength === 2
                                        ? "bg-warn"
                                        : "bg-ok"
                                      : "bg-surface-high"
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex justify-between text-[11px] text-muted font-mono">
                              <span>Password security</span>
                              <span className="font-semibold text-ink">
                                {strengthLabels[passwordStrength]}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </AnimatePresence>
                    </div>

                    {/* Remember Me Checkbox */}
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2.5 text-xs text-muted select-none cursor-pointer group">
                        <input
                          id="remember-me-checkbox"
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="w-4 h-4 rounded border-border bg-panel-alt text-accent focus:ring-accent accent-accent transition cursor-pointer"
                        />
                        <span className="group-hover:text-ink transition">
                          Stay signed in for 30 days
                        </span>
                      </label>
                    </div>

                    {/* Submit Button */}
                    <button
                      id="auth-submit-btn"
                      type="submit"
                      disabled={loading}
                      className="bb-btn bb-btn-primary w-full h-11 text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          <span>Signing in…</span>
                        </>
                      ) : (
                        <>
                          <span>Sign in to Workspace</span>
                          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>

                    {/* Divider */}
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="px-3 bg-panel text-muted font-mono uppercase tracking-wider text-[10px]">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    {/* Google OAuth Button */}
                    <button
                      id="auth-google-btn"
                      type="button"
                      onClick={() => {
                        window.location.href = `${API_URL}/v1/auth/google`;
                      }}
                      className="w-full h-11 rounded-full border border-border bg-surface-high/60 hover:bg-surface-high hover:border-faint text-ink text-sm font-medium transition flex items-center justify-center gap-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <GoogleIcon className="w-4 h-4" />
                      <span>Continue with Google Single Sign-On</span>
                    </button>

                    {/* Compliance & Privacy Footer Note */}
                    <p className="pt-2 text-center text-xs text-muted leading-relaxed">
                      By proceeding, you agree to Forge&apos;s{" "}
                      <Link to="/home" className="underline underline-offset-2 hover:text-ink">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link to="/home" className="underline underline-offset-2 hover:text-ink">
                        Privacy Policy
                      </Link>
                      .
                    </p>
                  </motion.div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </section>

        {/* Right Column: Architectural Showcase Section */}
        <aside
          id="auth-showcase-panel"
          className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-10 xl:p-14 border-l border-border bg-panel-alt/40 relative overflow-hidden"
        >
          {/* Subtle Ambient Background Accents */}
          <div
            className="pointer-events-none absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-ok/5 blur-3xl"
            aria-hidden="true"
          />

          {/* Top Showcase Content */}
          <div className="relative z-10 space-y-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-high border border-border text-xs font-mono text-muted">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span>Multi-Agent Software Engineering Engine</span>
            </div>

            <h2 className="font-display text-3xl xl:text-4xl font-semibold tracking-tight text-ink leading-tight">
              An autonomous organization built to design, build, and ship.
            </h2>

            <p className="text-body text-muted leading-relaxed">
              Every build coordinates specialist agents from requirements elicitation and architecture schemas to typed fullstack implementation and rigorous security auditing.
            </p>

            {/* Live Pipeline Preview Cards */}
            <div id="auth-showcase-pipeline" className="space-y-3 pt-2">
              <div className="text-xs font-mono uppercase tracking-wider text-muted flex items-center justify-between">
                <span>Active Agent Fleet</span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Deterministic loop</span>
              </div>

              {AGENT_PIPELINE.map((agent, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-panel border border-border/90 shadow-sm transition-all hover:border-border hover:shadow-md"
                >
                  <div className="p-2 rounded-lg bg-surface-high border border-border text-ink shrink-0 mt-0.5">
                    {i === 0 && <Bot className="w-4 h-4" />}
                    {i === 1 && <Layers className="w-4 h-4" />}
                    {i === 2 && <Terminal className="w-4 h-4" />}
                    {i === 3 && <ShieldCheck className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-ink">{agent.role}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${agent.color}`}
                      >
                        {agent.badge}
                      </span>
                    </div>
                    <p className="text-xs text-muted truncate">{agent.action}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Simulated Live Terminal Block */}
            <div
              id="auth-showcase-terminal"
              className="rounded-xl border border-border bg-panel p-4 font-mono text-xs space-y-2 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-border pb-2 text-[11px] text-muted">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-2">forge-orchestrator.log</span>
                </div>
                <span>v2.4-stream</span>
              </div>
              <div className="space-y-1.5 text-[11px] pt-1 text-muted">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500 font-bold">✔</span>
                  <span className="text-ink">PM Agent:</span>
                  <span>Synthesized 14 Epics & 3 Sprints from input prompt</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-500 font-bold">✔</span>
                  <span className="text-ink">Architect:</span>
                  <span>Normalized relational DDL & REST endpoints</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-500 font-bold">✔</span>
                  <span className="text-ink">QA Engine:</span>
                  <span>Zero runtime regressions • In-memory validation green</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Metrics Bar */}
          <div
            id="auth-showcase-stats"
            className="relative z-10 pt-8 mt-6 border-t border-border grid grid-cols-3 gap-4"
          >
            <div>
              <div className="font-display text-2xl font-bold tracking-tight text-ink">
                4.8x
              </div>
              <div className="text-xs text-muted mt-0.5">Faster deployment cycle</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold tracking-tight text-ink">
                100%
              </div>
              <div className="text-xs text-muted mt-0.5">Type-safe code verification</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold tracking-tight text-ink flex items-center gap-1.5">
                <span>0</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xs text-muted mt-0.5">Proprietary lock-in (Pure Git)</div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
