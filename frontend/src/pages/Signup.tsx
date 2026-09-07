import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Check, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { presets } from "../lib/animationPresets";
import { shouldReduceMotion } from "../lib/animations";
import { useAuthStore } from "../store/authStore";
import { validateNewPassword } from "../lib/passwordPolicy";
import BrandLogo from "../components/BrandLogo";
import PageBackground from "../components/PageBackground";

const easeOut = [0.16, 1, 0.3, 1] as const;

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
      <div className="min-h-screen bg-base text-ink flex items-center justify-center p-6">
        <PageBackground glow={false} />
        <motion.div
          {...(reduce ? {} : presets.pageTransition)}
          className="w-full max-w-sm text-center"
        >
          <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center mx-auto mb-6">
            <Mail className="w-5 h-5 text-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-light tracking-tight mb-2">Check your email</h1>
          <p className="text-sm text-muted leading-relaxed mb-8">
            We&apos;ve sent a verification link to <span className="text-ink">{submittedEmail}</span>. Click it to
            confirm your account — you can start setting up your workspace in the meantime.
          </p>
          <button
            type="button"
            onClick={() => navigate("/projects", { replace: true })}
            className="w-full h-11 rounded-[4px] bg-accent text-white text-sm font-medium shadow-[0_4px_14px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)] active:scale-[0.98] transition inline-flex items-center justify-center gap-2 group"
          >
            Continue to your projects <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col">
      <PageBackground glow={false} />
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOut }}
        className="border-b border-border-soft"
      >
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex items-center justify-between h-16">
            <Link to="/home" className="flex items-center gap-2.5 group">
              <BrandLogo size="sm" />
              <span className="font-brand text-[17px] font-semibold tracking-tight text-ink">Forge</span>
            </Link>
            <div className="text-sm text-muted">
              Already have an account?{" "}
              <Link to="/login" className="text-ink hover:underline underline-offset-4">
                Sign in
              </Link>
            </div>
          </nav>
        </div>
      </motion.header>

      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <div className="text-[12px] font-light tracking-[0.14em] uppercase text-muted mb-4 flex items-center gap-2">
              <span className="w-6 h-px bg-muted/50" aria-hidden="true" /> Sign up
            </div>
            <h2 className="font-display text-3xl font-light tracking-tight">Create your account</h2>
            <p className="text-sm text-muted mt-2">Get started in under a minute.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-5"
          >
            <div className="space-y-5">
              {errors.form && (
                <motion.div
                  id="signup-form-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2, ease: easeOut }}
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-2 rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error overflow-hidden"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{errors.form}</span>
                </motion.div>
              )}

              <div className="space-y-2">
                <label htmlFor="name" className="block text-[12px] font-light tracking-[0.14em] uppercase text-muted">
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
                  aria-describedby={errors.name ? "signup-name-error" : undefined}
                  className={`w-full h-11 px-3 bg-transparent border rounded-[4px] text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition ${
                    errors.name ? "border-error/60" : "border-border"
                  }`}
                />
                {errors.name && (
                  <motion.p
                    id="signup-name-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs text-error flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.name}
                  </motion.p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="block text-[12px] font-light tracking-[0.14em] uppercase text-muted">
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
                  aria-describedby={errors.email ? "signup-email-error" : undefined}
                  className={`w-full h-11 px-3 bg-transparent border rounded-[4px] text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition ${
                    errors.email ? "border-error/60" : "border-border"
                  }`}
                />
                {errors.email && (
                  <motion.p
                    id="signup-email-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs text-error flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.email}
                  </motion.p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-[12px] font-light tracking-[0.14em] uppercase text-muted">
                  Password
                </label>
                <p className="text-xs text-muted -mt-1">
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
                    aria-describedby={errors.password ? "signup-password-error" : undefined}
                    className={`w-full h-11 pl-3 pr-10 bg-transparent border rounded-[4px] text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition ${
                      errors.password ? "border-error/60" : "border-border"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted hover:text-ink transition overflow-hidden"
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
                    id="signup-password-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs text-error flex items-center gap-1.5"
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
                <label htmlFor="confirmPassword" className="block text-[12px] font-light tracking-[0.14em] uppercase text-muted">
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
                  aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
                  className={`w-full h-11 px-3 bg-transparent border rounded-[4px] text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition ${
                    errors.confirmPassword ? "border-error/60" : "border-border"
                  }`}
                />
                {errors.confirmPassword && (
                  <motion.p
                    id="signup-confirm-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs text-error flex items-center gap-1.5"
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
                className="w-full h-11 rounded-[4px] bg-accent text-white text-sm font-medium shadow-[0_4px_14px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition inline-flex items-center justify-center gap-2 group"
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
            </div>
          </form>

          <p className="mt-8 text-xs text-muted text-center leading-relaxed">
            By creating an account, you agree to Forge's Terms and Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
}
