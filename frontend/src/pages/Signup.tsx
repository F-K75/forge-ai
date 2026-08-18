import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, AlertCircle, Check, Mail, User, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { presets } from "../lib/animationPresets";
import { shouldReduceMotion } from "../lib/animations";
import { useAuthStore } from "../store/authStore";
import { validateNewPassword } from "../lib/passwordPolicy";
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

function validateName(value: string): string | undefined {
  if (!value) return "Please enter your full name.";
  if (value.length < 2) return "Name must be at least 2 characters.";
  return undefined;
}

function validateEmail(value: string): string | undefined {
  if (!value) return "Please enter your email.";
  if (!EMAIL_RE.test(value)) return "Please enter a valid email address.";
  return undefined;
}

const validatePassword = validateNewPassword;

type Field = "name" | "email" | "password" | "confirmPassword";
type Errors = Partial<Record<Field | "form", string>>;

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

export default function Signup() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const reduce = shouldReduceMotion();

  const validateConfirmPassword = (value: string, passwordValue: string): string | undefined => {
    if (!value) return "Please confirm your password.";
    if (value !== passwordValue) return "The passwords you entered don't match.";
    return undefined;
  };

  const validate = (field: Field, value: string) => {
    const error =
      field === "name" ? validateName(value) :
      field === "email" ? validateEmail(value) :
      field === "password" ? validatePassword(value) :
      validateConfirmPassword(value, password);
    setErrors((e) => ({ ...e, [field]: error }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmPasswordError = validateConfirmPassword(confirmPassword, password);
    if (nameError || emailError || passwordError || confirmPasswordError) {
      setErrors({ name: nameError, email: emailError, password: passwordError, confirmPassword: confirmPasswordError });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await register(email, name, password);
      setSubmittedEmail(email);
    } catch (err: any) {
      setErrors({ form: err?.response?.data?.detail || "We couldn't create your account. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const meetsFullPolicy = [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%^&*(),.?":{}|<>]/].every((re) => re.test(password));
  const passwordStrength = password.length === 0 ? 0 : password.length < 12 ? 1 : meetsFullPolicy ? 3 : 2;

  const inputBase =
    "w-full h-12 rounded-2xl border bg-land-paper/80 px-4 text-base text-land-ink placeholder:text-land-muted outline-none transition-all duration-200 ease-out focus:border-accent/60 focus:bg-land-paper focus:shadow-[0_0_0_4px_var(--state-focus)]";

  if (submittedEmail) {
    return (
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <motion.div
          {...(reduce ? {} : presets.pageTransition)}
          className="w-full max-w-sm text-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: easeOut }}
            className="w-14 h-14 rounded-2xl border border-land-border bg-land-paper flex items-center justify-center mx-auto mb-8"
          >
            <Mail className="w-6 h-6 text-land-ink" aria-hidden="true" />
          </motion.div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mb-3">Check your email</h1>
          <p className="text-sm text-land-muted leading-relaxed mb-10">
            We&apos;ve sent a verification link to <span className="text-land-ink font-medium">{submittedEmail}</span>. Click it to confirm your account — you can start setting up your workspace in the meantime.
          </p>
          <motion.button
            type="button"
            onClick={() => navigate("/projects", { replace: true })}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="bb-btn bb-btn-primary w-full"
          >
            Continue to your projects <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </motion.button>
        </motion.div>
      </div>
    );
  }

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
            Already have an account?{" "}
            <Link to="/login" className="text-land-ink font-medium hover:underline underline-offset-4 transition">
              Sign in
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
                Create your workspace. Ship from day one.
              </h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Launch your first build in seconds. Free to start, no credit card required.
              </p>
              <ul className="space-y-4 text-sm">
                {["Free tier includes 10 credits", "Six specialist agents, one prompt", "Cancel or upgrade anytime"].map((t) => (
                  <motion.li key={t} variants={fadeUp} className="flex items-center gap-3.5 text-white/80">
                    <span className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" aria-hidden="true" />
                    </span>
                    {t}
                  </motion.li>
                ))}
              </ul>
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
                <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Sign up
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-land-ink">Create your account</h2>
              <p className="text-sm text-land-muted mt-2">Get started in under a minute.</p>
            </div>

            <motion.form
              onSubmit={handleSubmit}
              noValidate
              variants={panelStagger}
              className="space-y-6"
            >
              <motion.div variants={fadeUp} className="space-y-6">
                {errors.form && (
                  <motion.div
                    id="signup-form-error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.25, ease: easeOut }}
                    role="alert"
                    aria-live="assertive"
                    className="flex items-start gap-2.5 rounded-2xl border border-land-destructive/40 bg-land-destructive/10 p-4 text-sm text-land-destructive overflow-hidden"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{errors.form}</span>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <label htmlFor="name" className="block text-xs uppercase tracking-[0.14em] text-land-muted font-medium">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-land-muted pointer-events-none" aria-hidden="true" />
                    <motion.input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (touched.name) validate("name", e.target.value);
                      }}
                      onBlur={() => {
                        setTouched((t) => ({ ...t, name: true }));
                        validate("name", name);
                      }}
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "signup-name-error" : undefined}
                      whileFocus={{ scale: 1.005 }}
                      transition={{ duration: 0.2, ease: easeOut }}
                      className={`${inputBase} pl-11 ${errors.name ? "!border-land-destructive/60" : ""}`}
                    />
                  </div>
                  <AnimatePresence>
                    {errors.name && (
                      <motion.p
                        id="signup-name-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs text-land-destructive flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.name}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

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
                        if (touched.email) validate("email", e.target.value);
                      }}
                      onBlur={() => {
                        setTouched((t) => ({ ...t, email: true }));
                        validate("email", email);
                      }}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "signup-email-error" : undefined}
                      whileFocus={{ scale: 1.005 }}
                      transition={{ duration: 0.2, ease: easeOut }}
                      className={`${inputBase} pl-11 ${errors.email ? "!border-land-destructive/60" : ""}`}
                    />
                  </div>
                  <AnimatePresence>
                    {errors.email && (
                      <motion.p
                        id="signup-email-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs text-land-destructive flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.email}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-land-muted font-medium">
                    Password
                  </label>
                  <p className="text-xs text-land-muted -mt-1">
                    12+ characters, including uppercase, lowercase, a number, and a symbol.
                  </p>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-land-muted pointer-events-none" aria-hidden="true" />
                    <motion.input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Create a password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (touched.password) validate("password", e.target.value);
                      }}
                      onBlur={() => {
                        setTouched((t) => ({ ...t, password: true }));
                        validate("password", password);
                      }}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "signup-password-error" : undefined}
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
                    {errors.password ? (
                      <motion.p
                        id="signup-password-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs text-land-destructive flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.password}
                      </motion.p>
                    ) : (
                      <motion.div
                        key="strength"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex gap-1.5 pt-1"
                        aria-hidden="true"
                      >
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{
                              backgroundColor:
                                i < passwordStrength
                                  ? passwordStrength === 1
                                    ? "hsl(0 84% 60% / 0.8)"
                                    : passwordStrength === 2
                                    ? "hsl(45 93% 47% / 0.8)"
                                    : "hsl(217 90% 62% / 0.9)"
                                  : "hsl(0 0% 12% / 0.6)",
                            }}
                            transition={{ duration: 0.3, ease: easeOut }}
                            className="h-1 flex-1 rounded-full"
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-xs uppercase tracking-[0.14em] text-land-muted font-medium">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-land-muted pointer-events-none" aria-hidden="true" />
                    <motion.input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (touched.confirmPassword) validate("confirmPassword", e.target.value);
                      }}
                      onBlur={() => {
                        setTouched((t) => ({ ...t, confirmPassword: true }));
                        validate("confirmPassword", confirmPassword);
                      }}
                      aria-invalid={!!errors.confirmPassword}
                      aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
                      whileFocus={{ scale: 1.005 }}
                      transition={{ duration: 0.2, ease: easeOut }}
                      className={`${inputBase} pl-11 ${errors.confirmPassword ? "!border-land-destructive/60" : ""}`}
                    />
                  </div>
                  <AnimatePresence>
                    {errors.confirmPassword && (
                      <motion.p
                        id="signup-confirm-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs text-land-destructive flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.confirmPassword}
                      </motion.p>
                    )}
                  </AnimatePresence>
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
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Creating account…
                    </>
                  ) : (
                    <>
                      Create account <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </motion.button>
              </motion.div>
            </motion.form>

            <motion.p variants={fadeUp} className="mt-8 text-xs text-land-muted text-center leading-relaxed">
              By creating an account, you agree to Forge&apos;s{" "}
              <Link to="/terms" className="underline underline-offset-4 hover:text-land-ink">Terms</Link>
              {" "}and{" "}
              <Link to="/privacy" className="underline underline-offset-4 hover:text-land-ink">Privacy Policy</Link>.
            </motion.p>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
