import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Check, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { presets } from "../lib/animationPresets";
import { shouldReduceMotion } from "../lib/animations";
import { useAuthStore } from "../store/authStore";
import { validateNewPassword } from "../lib/passwordPolicy";
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

  if (submittedEmail) {
    return (
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <motion.div
          {...(reduce ? {} : presets.pageTransition)}
          className="w-full max-w-sm text-center"
        >
          <div className="w-12 h-12 rounded-full border border-land-border flex items-center justify-center mx-auto mb-6">
            <Mail className="w-5 h-5 text-land-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Check your email</h1>
          <p className="text-sm text-land-muted leading-relaxed mb-8">
            We've sent a verification link to <span className="text-land-ink">{submittedEmail}</span>. Click it to
            confirm your account — you can start setting up your workspace in the meantime.
          </p>
          <button
            type="button"
            onClick={() => navigate("/projects", { replace: true })}
            className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 active:scale-[0.98] transition inline-flex items-center justify-center gap-2 group"
          >
            Continue to your projects <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-land-paper text-land-ink">
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
              Already have an account?{" "}
              <Link to="/login" className="text-land-ink hover:underline underline-offset-4">
                Sign in
              </Link>
            </div>
          </nav>
        </div>
      </motion.header>

      <main className="grid lg:grid-cols-2 min-h-[calc(100vh-4rem)]">
        <motion.aside
          initial="hidden"
          animate="show"
          variants={panelStagger}
          className="hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-land-border/60 relative overflow-hidden"
        >
          <AgentNetworkArt />
          <motion.div variants={fadeUp} className="relative z-10 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-land-muted">
            <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" />
            Forge · Console
          </motion.div>
          <div className="relative z-10 max-w-md space-y-8">
            <motion.h1 variants={fadeUp} className="font-display text-4xl xl:text-5xl font-medium leading-[1.05] tracking-tight">
              Create your workspace. Ship from day one.
            </motion.h1>
            <motion.p variants={fadeUp} className="text-land-muted leading-relaxed">
              Launch your first build in seconds. Free to start, no credit card required.
            </motion.p>
            <ul className="space-y-3 text-sm">
              {["Free tier includes 10 credits", "Six specialist agents, one prompt", "Cancel or upgrade anytime"].map((t) => (
                <motion.li key={t} variants={fadeUp} className="flex items-center gap-3 text-land-muted">
                  <span className="w-5 h-5 rounded-full border border-land-border flex items-center justify-center">
                    <Check className="w-3 h-3 text-land-ink" aria-hidden="true" />
                  </span>
                  {t}
                </motion.li>
              ))}
            </ul>
          </div>
          <motion.div variants={fadeUp} className="relative z-10 text-xs text-land-muted/70 font-mono">
            // forge.ai — build pipeline
          </motion.div>
        </motion.aside>

        <motion.section
          initial="hidden"
          animate="show"
          variants={panelStagger}
          className="flex items-center justify-center p-6 sm:p-10"
        >
          <div className="w-full max-w-sm">
            <motion.div variants={fadeUp} className="mb-10">
              <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
                <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Sign up
              </div>
              <h2 className="font-display text-3xl font-medium tracking-tight">Create your account</h2>
              <p className="text-sm text-land-muted mt-2">Get started in under a minute.</p>
            </motion.div>

            <motion.form
              onSubmit={handleSubmit}
              noValidate
              variants={panelStagger}
              className="space-y-5"
            >
              <motion.div variants={fadeUp} className="space-y-5">
                {errors.form && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2, ease: easeOut }}
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive overflow-hidden"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{errors.form}</span>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <label htmlFor="name" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Full name
                  </label>
                  <input
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
                    className={`w-full h-11 px-3 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                      errors.name ? "border-land-destructive/60" : "border-land-border"
                    }`}
                  />
                  {errors.name && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs text-land-destructive flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.name}
                    </motion.p>
                  )}
                </div>

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
                      if (touched.email) validate("email", e.target.value);
                    }}
                    onBlur={() => {
                      setTouched((t) => ({ ...t, email: true }));
                      validate("email", email);
                    }}
                    aria-invalid={!!errors.email}
                    className={`w-full h-11 px-3 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                      errors.email ? "border-land-destructive/60" : "border-land-border"
                    }`}
                  />
                  {errors.email && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs text-land-destructive flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.email}
                    </motion.p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Password
                  </label>
                  <p className="text-xs text-land-muted -mt-1">
                    12+ characters, including uppercase, lowercase, a number, and a symbol.
                  </p>
                  <div className="relative">
                    <input
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
                      className={`w-full h-11 pl-3 pr-10 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                        errors.password ? "border-land-destructive/60" : "border-land-border"
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
                  {errors.password ? (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs text-land-destructive flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.password}
                    </motion.p>
                  ) : (
                    <div className="flex gap-1 pt-1" aria-hidden="true">
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
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
                    Confirm password
                  </label>
                  <input
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
                    className={`w-full h-11 px-3 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                      errors.confirmPassword ? "border-land-destructive/60" : "border-land-border"
                    }`}
                  />
                  {errors.confirmPassword && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs text-land-destructive flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.confirmPassword}
                    </motion.p>
                  )}
                </div>

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: loading ? 1 : 1.01 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                  className="bb-btn bb-btn-primary w-full group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Creating account…
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
              By creating an account, you agree to Forge's Terms and Privacy Policy.
            </motion.p>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
