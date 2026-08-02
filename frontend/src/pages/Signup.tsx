import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Check, Mail } from "lucide-react";
import { motion } from "motion/react";
import { presets } from "../lib/animationPresets";
import { motionVariants, shouldReduceMotion } from "../lib/animations";
import { useAuthStore } from "../store/authStore";
import { validateNewPassword } from "../lib/passwordPolicy";

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
              Already have an account?{" "}
              <Link to="/login" className="text-land-ink hover:underline underline-offset-4">
                Sign in
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className="grid lg:grid-cols-2 min-h-[calc(100vh-4rem)]">
        <motion.aside
          {...(reduce ? {} : { variants: motionVariants.fadeIn, initial: "hidden", animate: "visible" })}
          className="hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-land-border/60"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-land-muted">
            <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" />
            Forge · Console
          </div>
          <div className="max-w-md space-y-8">
            <h1 className="font-display text-4xl xl:text-5xl font-medium leading-[1.05] tracking-tight">
              Create your workspace. Ship from day one.
            </h1>
            <p className="text-land-muted leading-relaxed">
              Launch your first build in seconds. Free to start, no credit card required.
            </p>
            <ul className="space-y-3 text-sm">
              {["Free tier includes 10 credits", "Six specialist agents, one prompt", "Cancel or upgrade anytime"].map((t) => (
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
        </motion.aside>

        <motion.section
          {...(reduce ? {} : presets.pageTransition)}
          className="flex items-center justify-center p-6 sm:p-10"
        >
          <div className="w-full max-w-sm">
            <div className="mb-10">
              <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
                <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Sign up
              </div>
              <h2 className="font-display text-3xl font-medium tracking-tight">Create your account</h2>
              <p className="text-sm text-land-muted mt-2">Get started in under a minute.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {errors.form && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{errors.form}</span>
                </div>
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
                  <p className="text-xs text-land-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.name}
                  </p>
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
                  <p className="text-xs text-land-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.email}
                  </p>
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-land-muted hover:text-land-ink transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                {errors.password ? (
                  <p className="text-xs text-land-destructive flex items-center gap-1.5">
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
                  <p className="text-xs text-land-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" /> {errors.confirmPassword}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 group"
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
              </button>
            </form>

            <p className="mt-8 text-xs text-land-muted text-center leading-relaxed">
              By creating an account, you agree to Forge's Terms and Privacy Policy.
            </p>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
