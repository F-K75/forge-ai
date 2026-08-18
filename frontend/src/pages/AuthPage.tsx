import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Chrome, Lock, User } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { API_URL } from "../store/authStore";
import BrandLogo from "../components/BrandLogo";

const easeOut = [0.16, 1, 0.3, 1] as const;

const panelStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

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
        transition={{ duration: 1.2, ease: easeOut }}
        className="absolute -right-32 -top-20 w-[500px] h-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(217 90% 62% / 0.18) 0%, transparent 65%)",
        }}
      />
      <svg viewBox="0 0 360 380" className="absolute right-4 bottom-4 w-[480px] h-[480px] opacity-[0.85]" fill="none">
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
              stroke="hsl(0 0% 96% / 0.12)"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, delay: 0.4 + i * 0.09, ease: easeOut }}
            />
          );
        })}
        {NETWORK_NODES.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={i === 1 ? 6 : 3.5}
            fill={i === 1 ? "hsl(217 90% 62%)" : "hsl(0 0% 96% / 0.45)"}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.25, 1],
              opacity: 1,
              y: [n.y, n.y - 6, n.y],
            }}
            transition={{
              scale: { duration: 0.5, delay: 0.6 + i * 0.09 },
              opacity: { duration: 0.5, delay: 0.6 + i * 0.09 },
              y: { duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: 1.2 + i * 0.35 },
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

  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | undefined>();

  const loginShake = useAnimationControls();
  const mfaShake = useAnimationControls();

  useEffect(() => {
    if (errors.form) loginShake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.35, ease: easeOut } });
  }, [errors.form, loginShake]);

  useEffect(() => {
    if (mfaError) mfaShake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.35, ease: easeOut } });
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

  const inputBase =
    "w-full h-12 rounded-2xl border bg-land-paper/80 px-4 text-base text-land-ink placeholder:text-land-muted outline-none transition-all duration-200 ease-out focus:border-accent/60 focus:bg-land-paper focus:shadow-[0_0_0_4px_var(--state-focus)]";

  return (
    <div className="min-h-screen bg-land-paper text-land-ink">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="fixed top-0 inset-x-0 z-50 border-b border-land-border/50 bg-land-paper/70 backdrop-blur-xl"
      >
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2.5 group">
            <BrandLogo size="sm" bordered />
            <span className="font-display font-semibold tracking-tight text-lg">Forge</span>
          </Link>
          <div className="text-sm text-land-muted">
            New to Forge?{" "}
            <Link to="/signup" className="text-land-ink font-medium hover:underline underline-offset-4 transition">
              Create account
            </Link>
          </div>
        </div>
      </motion.header>

      <main className="grid lg:grid-cols-2 min-h-screen">
        <motion.aside
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: easeOut }}
          className="hidden lg:block relative overflow-hidden bg-black"
        >
          <div className="absolute inset-0 bg-cover bg-top" style={{ backgroundImage: 'url(/images/login-visual.jpg)' }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
          <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
            <AgentNetworkArt />
            <motion.div variants={fadeUp} className="relative z-10 max-w-md space-y-6">
              <h1 className="font-display text-4xl xl:text-5xl font-semibold leading-[1.08] tracking-tight text-white">
                Build with intent.
              </h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Forge connects your team, agents, and delivery pipeline into one workspace.
              </p>
            </motion.div>
            <motion.div variants={fadeUp} className="relative z-10 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/50">
              <span className="w-6 h-px bg-white/30" aria-hidden="true" />
              Forge · Console
            </motion.div>
          </div>
        </motion.aside>

        <section className="flex items-center justify-center px-6 py-24 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOut }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-10">
              <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
                <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Sign in
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-land-ink">Welcome back</h2>
              <p className="text-sm text-land-muted mt-2">Sign in to pick up where you left off.</p>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {mfaToken ? (
                <motion.form
                  key="mfa"
                  onSubmit={handleMfaSubmit}
                  noValidate
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.2, ease: easeOut } }}
                  transition={{ duration: 0.4, ease: easeOut }}
                  className="space-y-6"
                >
                  <motion.div animate={mfaShake} className="space-y-6">
                    <p className="text-sm text-land-muted leading-relaxed">
                      Enter the 6-digit code from your authenticator app, or use one of your backup codes.
                    </p>
                    <AnimatePresence>
                      {mfaError && (
                        <motion.div
                          id="mfa-error"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: easeOut }}
                          role="alert"
                          aria-live="assertive"
                          className="flex items-start gap-2.5 rounded-2xl border border-land-destructive/40 bg-land-destructive/10 p-4 text-sm text-land-destructive overflow-hidden"
                        >
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{mfaError}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="space-y-2">
                      <label htmlFor="mfa-code" className="block text-xs uppercase tracking-[0.14em] text-land-muted font-medium">
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
                        aria-describedby={mfaError ? "mfa-code-error" : undefined}
                        autoFocus
                        whileFocus={{ scale: 1.01 }}
                        transition={{ duration: 0.2, ease: easeOut }}
                        className={`${inputBase} ${mfaError ? "!border-land-destructive/60" : ""}`}
                      />
                    </div>
                    <motion.button
                      type="submit"
                      disabled={loading || !mfaCode.trim()}
                      whileHover={{ scale: loading ? 1 : 1.01 }}
                      whileTap={{ scale: loading ? 1 : 0.98 }}
                      className="bb-btn bb-btn-primary w-full"
                    >
                      {loading ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Verifying…
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
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.2, ease: easeOut } }}
                  transition={{ duration: 0.4, ease: easeOut }}
                  className="space-y-6"
                >
                  <motion.div animate={loginShake} className="space-y-6">
                    <AnimatePresence>
                      {errors.form && (
                        <motion.div
                          id="form-error"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: easeOut }}
                          role="alert"
                          aria-live="assertive"
                          className="flex items-start gap-2.5 rounded-2xl border border-land-destructive/40 bg-land-destructive/10 p-4 text-sm text-land-destructive overflow-hidden"
                        >
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{errors.form}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-2">
                      <label htmlFor="email" className="block text-xs uppercase tracking-[0.14em] text-land-muted font-medium">
                        Email
                      </label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-land-muted pointer-events-none" aria-hidden="true" />
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
                          aria-describedby={errors.email ? "email-error" : undefined}
                          whileFocus={{ scale: 1.005 }}
                          transition={{ duration: 0.2, ease: easeOut }}
                          className={`${inputBase} pl-11 ${errors.email ? "!border-land-destructive/60" : ""}`}
                        />
                      </div>
                      <AnimatePresence>
                        {errors.email && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
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
                        <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-land-muted font-medium">
                          Password
                        </label>
                        <Link to="/forgot-password" className="text-xs text-land-muted hover:text-land-ink transition">
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-land-muted pointer-events-none" aria-hidden="true" />
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
                          aria-describedby={errors.password ? "password-error" : undefined}
                          whileFocus={{ scale: 1.005 }}
                          transition={{ duration: 0.2, ease: easeOut }}
                          className={`${inputBase} pl-11 pr-12 ${errors.password ? "!border-land-destructive/60" : ""}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-land-muted hover:text-land-ink transition-colors"
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
                      <AnimatePresence>
                        {errors.password && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            id="password-error"
                            className="text-xs text-land-destructive flex items-center gap-1.5"
                          >
                            <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.password}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2.5 text-sm text-land-muted cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="w-4 h-4 rounded-lg border-land-border bg-land-paper accent-land-ink"
                        />
                        Keep me signed in
                      </label>
                    </div>

                    <motion.button
                      type="submit"
                      disabled={loading}
                      whileHover={{ scale: loading ? 1 : 1.01 }}
                      whileTap={{ scale: loading ? 1 : 0.98 }}
                      className="bb-btn bb-btn-primary w-full"
                    >
                      {loading ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Signing in…
                        </>
                      ) : (
                        <>
                          Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </>
                      )}
                    </motion.button>

                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-land-border" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="px-3 bg-land-paper text-land-muted">Or continue with</span>
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      onClick={() => {
                        window.location.href = `${API_URL}/v1/auth/google`;
                      }}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full h-12 rounded-2xl border border-land-border bg-land-paper text-land-ink text-sm font-medium hover:bg-land-border/30 active:scale-[0.98] transition inline-flex items-center justify-center gap-2.5"
                    >
                      <Chrome className="w-4 h-4" aria-hidden="true" />
                      Google
                    </motion.button>

                    <p className="text-xs text-land-muted text-center leading-relaxed">
                      By continuing, you agree to Forge&apos;s{" "}
                      <Link to="/terms" className="underline underline-offset-4 hover:text-land-ink">Terms</Link>
                      {" "}and{" "}
                      <Link to="/privacy" className="underline underline-offset-4 hover:text-land-ink">Privacy Policy</Link>.
                    </p>
                  </motion.div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
