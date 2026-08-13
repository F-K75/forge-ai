import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Check, Chrome } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { API_URL } from "../store/authStore";
import BrandLogo from "../components/BrandLogo";

const easeOut = [0.16, 1, 0.3, 1] as const;

const panelStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | undefined {
  if (!value) return "Please enter your email.";
  if (!EMAIL_RE.test(value)) return "Please enter a valid email address.";
  return undefined;
}

function validatePassword(value: string): string | undefined {
  // Login checks an existing password against the server, not a new one --
  // it must never enforce a minimum length here, or raising that minimum
  // (see Signup.tsx/ResetPassword.tsx) would lock out any real account
  // whose already-set password is shorter than the current requirement.
  if (!value) return "Please enter your password.";
  return undefined;
}

type Errors = Partial<Record<"email" | "password" | "form", string>>;

const NETWORK_NODES = [
  { x: 60, y: 40 },
  { x: 220, y: 90 },
  { x: 140, y: 190 },
  { x: 300, y: 220 },
  { x: 70, y: 300 },
  { x: 250, y: 340 },
];

const NETWORK_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 5],
];

function AgentNetworkArt() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: easeOut }}
        className="absolute -right-24 -top-16 w-[420px] h-[420px] rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(217 90% 62% / 0.16) 0%, transparent 70%)",
        }}
      />
      <svg viewBox="0 0 360 380" className="absolute right-0 bottom-0 w-[440px] h-[440px] opacity-[0.9]" fill="none">
        {NETWORK_EDGES.map(([a, b], i) => {
          const from = NETWORK_NODES[a];
          const to = NETWORK_NODES[b];
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="hsl(0 0% 96% / 0.14)"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease: easeOut }}
            />
          );
        })}
        {NETWORK_NODES.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={i === 1 ? 5 : 3}
            fill={i === 1 ? "hsl(217 90% 62%)" : "hsl(0 0% 96% / 0.5)"}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.3, 1],
              opacity: 1,
              y: [n.y, n.y - 5, n.y],
            }}
            transition={{
              scale: { duration: 0.4, delay: 0.5 + i * 0.08 },
              opacity: { duration: 0.4, delay: 0.5 + i * 0.08 },
              y: { duration: 4 + i, repeat: Infinity, ease: "easeInOut", delay: 1 + i * 0.3 },
            }}
          />
        ))}
      </svg>
    </div>
  );
}

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

  const loginShake = useAnimationControls();
  const mfaShake = useAnimationControls();

  useEffect(() => {
    if (errors.form) loginShake.start({ x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.4, ease: easeOut } });
  }, [errors.form, loginShake]);

  useEffect(() => {
    if (mfaError) mfaShake.start({ x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.4, ease: easeOut } });
  }, [mfaError, mfaShake]);

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
      setErrors({ form: err?.response?.data?.detail || "The email or password you entered is incorrect. Please try again or reset your password." });
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
      setMfaError(err?.response?.data?.detail || "The code you entered is invalid. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 3 : 2;

  const emailErrorId = errors.email ? "email-error" : undefined;
  const passwordErrorId = errors.password ? "password-error" : undefined;
  const formErrorId = errors.form ? "form-error" : undefined;
  const mfaErrorId = mfaError ? "mfa-error" : undefined;

  return (
    <div className="min-h-screen text-land-ink bg-base">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="border-b border-land-border/60"
      >
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex items-center justify-between h-16">
            <Link to="/home" className="flex items-center gap-2 group">
              <BrandLogo size="sm" bordered />
              <span className="font-display font-medium tracking-tight">Forge</span>
            </Link>
            <div className="text-sm text-land-muted">
              New to Forge?{" "}
              <Link to="/signup" className="text-land-ink hover:text-land-ink/80 transition">
                Create account
              </Link>
            </div>
          </nav>
        </div>
      </motion.header>

      <main className="grid lg:grid-cols-2 min-h-[calc(100vh-4rem)]">
        {/* Form */}
        <section className="flex items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="w-full max-w-sm"
          >
            <div className="mb-10">
              <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
                <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Sign in
              </div>
              <h2 className="font-display text-3xl font-medium tracking-tight">Welcome back</h2>
              <p className="text-sm text-land-muted mt-2">Pick up where your team left off.</p>
            </div>

            <AnimatePresence mode="wait" initial={false}>
            {mfaToken ? (
              <motion.form
                key="mfa"
                onSubmit={handleMfaSubmit}
                noValidate
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.2, ease: easeOut } }}
                transition={{ duration: 0.35, ease: easeOut }}
                className="space-y-5"
              >
              <motion.div animate={mfaShake} className="space-y-5">
                <p className="text-sm text-land-muted">
                  Enter the 6-digit code from your authenticator app, or use one of your backup codes.
                </p>
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
                    className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive overflow-hidden"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{mfaError}</span>
                  </motion.div>
                )}
                </AnimatePresence>
                <div className="space-y-2">
                  <label htmlFor="mfa-code" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Authentication code
                  </label>
                  <motion.input
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
                    whileFocus={{ scale: 1.01 }}
                    transition={{ duration: 0.15, ease: easeOut }}
                    className="bb-input h-11"
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={loading || !mfaCode.trim()}
                  whileHover={{ scale: loading ? 1 : 1.01 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                  className="bb-btn bb-btn-primary w-full group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Verifying…
                    </>
                  ) : (
                    <>
                      Continue <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </motion.button>
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
              </motion.div>
              </motion.form>
            ) : (
              <motion.form
                key="login"
                onSubmit={handleSubmit}
                noValidate
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.2, ease: easeOut } }}
                transition={{ duration: 0.35, ease: easeOut }}
                className="space-y-5"
              >
              <motion.div animate={loginShake} className="space-y-5">
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
                  className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive overflow-hidden"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{errors.form}</span>
                </motion.div>
              )}
              </AnimatePresence>

              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                  Email
                </label>
                <motion.input
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
                  aria-describedby={emailErrorId}
                  whileFocus={{ scale: 1.01 }}
                  transition={{ duration: 0.15, ease: easeOut }}
                  className={`bb-input h-11 ${
                    errors.email ? "!border-[rgb(var(--error))]" : ""
                  }`}
                />
                <AnimatePresence>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    id="email-error"
                    className="text-xs text-land-destructive flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.email}
                  </motion.p>
                )}
                </AnimatePresence>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs text-land-muted hover:text-land-ink transition">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <motion.input
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
                    aria-describedby={passwordErrorId}
                    whileFocus={{ scale: 1.01 }}
                    transition={{ duration: 0.15, ease: easeOut }}
                    className={`bb-input h-11 pr-10 ${
                      errors.password ? "!border-[rgb(var(--error))]" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-land-muted hover:text-land-ink transition overflow-hidden"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={showPassword ? "off" : "on"}
                        initial={{ opacity: 0, rotate: -45 }}
                        animate={{ opacity: 1, rotate: 0 }}
                        exit={{ opacity: 0, rotate: 45 }}
                        transition={{ duration: 0.15, ease: easeOut }}
                        className="block"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                </div>
                <AnimatePresence mode="wait">
                {errors.password ? (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    id="password-error"
                    className="text-xs text-land-destructive flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.password}
                  </motion.p>
                ) : (
                  <div key="strength" className="flex gap-1 pt-1" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{
                          backgroundColor:
                            i < passwordStrength
                              ? passwordStrength === 1
                                ? "hsl(0 84% 60% / 0.7)"
                                : passwordStrength === 2
                                ? "hsl(45 93% 47% / 0.7)"
                                : "hsl(217 90% 62%)"
                              : "hsl(0 0% 12%)",
                        }}
                        transition={{ duration: 0.25, ease: easeOut }}
                        className="h-0.5 flex-1 rounded-full"
                      />
                    ))}
                  </div>
                )}
                </AnimatePresence>
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

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.01 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="bb-btn bb-btn-primary w-full group"
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
              </motion.button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-land-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-land-paper text-land-muted">Or continue with</span>
                </div>
              </div>

              <motion.button
                type="button"
                onClick={() => {
                  window.location.href = `${API_URL}/v1/auth/google`
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full h-11 rounded-md border border-land-border bg-land-paper text-land-ink text-sm font-medium hover:bg-land-border/30 active:scale-[0.98] transition inline-flex items-center justify-center gap-2"
              >
                <Chrome className="w-4 h-4" aria-hidden="true" />
                Google
              </motion.button>

              <p className="mt-2 text-xs text-land-muted text-center leading-relaxed">
                By continuing, you agree to Forge's Terms and Privacy Policy.
              </p>
              </motion.div>
              </motion.form>
            )}
            </AnimatePresence>
          </motion.div>
        </section>

        {/* Right visual panel */}
        <motion.aside
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: easeOut }}
          className="hidden lg:block relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/images/login-visual.gif)' }} />
        </motion.aside>
      </main>
    </div>
  );
}
