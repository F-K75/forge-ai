import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  User,
  Sparkles,
  Check,
} from "lucide-react";
import { useAuthStore, API_URL } from "../store/authStore";
import { validateNewPassword } from "../lib/passwordPolicy";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import { DEMO_LOGIN_ENABLED } from "../lib/env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(value: string): string | undefined {
  if (!value || !value.trim()) return "Please enter your full name.";
  if (value.trim().length < 2) return "Name must be at least 2 characters.";
  return undefined;
}

function validateEmail(value: string): string | undefined {
  if (!value || !value.trim()) return "Please enter your email.";
  if (!EMAIL_RE.test(value.trim())) return "Please enter a valid email address.";
  return undefined;
}

function validateConfirmPassword(value: string, passwordValue: string): string | undefined {
  if (!value) return "Please confirm your password.";
  if (value !== passwordValue) return "The passwords you entered don't match.";
  return undefined;
}

type Field = "name" | "email" | "password" | "confirmPassword";
type Errors = Partial<Record<Field | "form", string>>;

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

export default function Signup() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);

  const handleKeyModifier = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
  };

  const handleQuickDemoFill = () => {
    setName("Alex Rivera");
    setEmail("alex.rivera@forge.ai");
    setPassword("ForgeDeveloper2026!");
    setConfirmPassword("ForgeDeveloper2026!");
    setErrors({});
  };

  const validateField = (field: Field, value: string) => {
    let error: string | undefined;
    if (field === "name") error = validateName(value);
    if (field === "email") error = validateEmail(value);
    if (field === "password") error = validateNewPassword(value);
    if (field === "confirmPassword") error = validateConfirmPassword(value, password);
    setErrors((prev) => ({ ...prev, [field]: error }));
    return error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true });

    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const passwordError = validateNewPassword(password);
    const confirmPasswordError = validateConfirmPassword(confirmPassword, password);

    if (nameError || emailError || passwordError || confirmPasswordError) {
      setErrors({
        name: nameError,
        email: emailError,
        password: passwordError,
        confirmPassword: confirmPasswordError,
      });
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await register(email.trim(), name.trim(), password);
      setSubmittedEmail(email.trim());
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrors({
        form: detail || "We could not create your workspace account. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const policyLength = password.length >= 12;
  const policyUpper = /[A-Z]/.test(password);
  const policyLower = /[a-z]/.test(password);
  const policyNumber = /[0-9]/.test(password);
  const policySpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-base text-ink flex flex-col">
      {/* Atmospheric backdrop: soft olive / rust / teal glows behind a glass card */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 ember-atmosphere opacity-90" />

      {/* 3-Zone Top Bar */}
      <header id="signup-header" className="h-16 border-b border-border bg-panel">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link id="signup-brand-logo" to="/home" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <BrandLogo size="sm" />
            <span className="font-display text-base font-semibold tracking-tight text-ink">
              Forge AI
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-6 text-sm font-medium text-muted">
            <Link to="/home" className="whitespace-nowrap hover:text-ink transition-colors">
              Home
            </Link>
            <Link to="/studio-3d" className="whitespace-nowrap hover:text-ink transition-colors">
              3D Studio
            </Link>
            <Link to="/launch" className="whitespace-nowrap hover:text-ink transition-colors">
              Launchpad
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2.5">
            <ThemeToggle compact />
            <Link
              id="signup-nav-login-link"
              to="/login"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-pill border border-glass-border bg-glass px-3.5 text-sm font-medium text-ink backdrop-blur-[5px] transition-colors hover:bg-ink/10"
            >
              <span>Sign in</span>
            </Link>
          </div>
        </div>
      </header>

      <main
        id="signup-main-container"
        className="relative mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-10 sm:px-6 lg:px-8"
      >
        <div className="flex w-full justify-center">
          <section className="flex w-full max-w-md flex-col justify-center">
            <div
              id="signup-form-card"
              className="rounded-2xl border border-glass-strong-border bg-glass-strong p-6 sm:p-8 backdrop-blur-xl"
            >
              {submittedEmail ? (
                <div id="signup-verification-state" className="space-y-5">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-ok">
                    <CheckCircle2 size={16} />
                    <span>Account initialized</span>
                  </div>
                  <h1 id="signup-verify-heading" className="font-display text-2xl font-semibold tracking-tight text-ink">
                    Check your inbox
                  </h1>
                  <div className="rounded-lg border border-border bg-panel-alt/60 p-4 text-sm text-muted space-y-2">
                    <p>We dispatched a verification link to:</p>
                    <p className="font-mono text-sm font-semibold text-ink break-all">
                      {submittedEmail}
                    </p>
                    <p className="text-xs">
                      Click the link to verify your email and enter your workspace.
                    </p>
                  </div>
                  <button
                    id="signup-continue-workspace-btn"
                    type="button"
                    onClick={() => navigate("/projects", { replace: true })}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-on-ink transition-colors hover:bg-ink/90 cursor-pointer"
                  >
                    <span>Continue to workspace</span>
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmittedEmail(null)}
                    className="w-full text-center text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    Use a different email address
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <h1 id="signup-heading" className="font-display text-2xl font-semibold tracking-tight text-ink">
                        Create your account
                      </h1>
                      <p className="mt-1 text-sm text-muted">
                        Deploy specialist agent workspaces in under a minute.
                      </p>
                    </div>
                    {DEMO_LOGIN_ENABLED && (
                    <button
                      id="signup-demo-fill-btn"
                      type="button"
                      onClick={handleQuickDemoFill}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-panel-alt px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-high transition-colors cursor-pointer"
                    >
                      <Sparkles size={12} className="text-accent" />
                      <span>Auto-fill test account</span>
                    </button>
                    )}
                  </div>

                  <form id="signup-form" onSubmit={handleSubmit} noValidate className="space-y-4">
                    {errors.form && (
                      <div
                        id="signup-form-error"
                        role="alert"
                        className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 p-3 text-xs font-medium text-error"
                      >
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        <span>{errors.form}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label htmlFor="name" className="block text-xs font-medium text-ink">
                        Full name
                      </label>
                      <div className="relative">
                        <input
                          id="name"
                          type="text"
                          autoComplete="name"
                          placeholder="Ada Lovelace"
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value);
                            if (touched.name) validateField("name", e.target.value);
                          }}
                          onBlur={() => {
                            setTouched((t) => ({ ...t, name: true }));
                            validateField("name", name);
                          }}
                          aria-invalid={!!errors.name}
                          className={`h-10 w-full rounded-md border bg-panel pl-9 pr-3.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                            errors.name ? "border-error" : "border-border"
                          }`}
                        />
                        <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      </div>
                      {errors.name && (
                        <p id="signup-name-error" className="text-xs text-error">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="email" className="block text-xs font-medium text-ink">
                        Email
                      </label>
                      <div className="relative">
                        <input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (touched.email) validateField("email", e.target.value);
                          }}
                          onBlur={() => {
                            setTouched((t) => ({ ...t, email: true }));
                            validateField("email", email);
                          }}
                          aria-invalid={!!errors.email}
                          className={`h-10 w-full rounded-md border bg-panel pl-9 pr-3.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                            errors.email ? "border-error" : "border-border"
                          }`}
                        />
                        <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      </div>
                      {errors.email && (
                        <p id="signup-email-error" className="text-xs text-error">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="block text-xs font-medium text-ink">
                          Password
                        </label>
                        <span className="text-[11px] text-muted">12+ characters</span>
                      </div>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="••••••••••••"
                          value={password}
                          onKeyDown={handleKeyModifier}
                          onKeyUp={handleKeyModifier}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (touched.password) validateField("password", e.target.value);
                            if (touched.confirmPassword) {
                              setErrors((er) => ({
                                ...er,
                                confirmPassword: validateConfirmPassword(confirmPassword, e.target.value),
                              }));
                            }
                          }}
                          onBlur={() => {
                            setTouched((t) => ({ ...t, password: true }));
                            validateField("password", password);
                          }}
                          aria-invalid={!!errors.password}
                          className={`h-10 w-full rounded-md border bg-panel pl-9 pr-10 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                            errors.password ? "border-error" : "border-border"
                          }`}
                        />
                        <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <button
                          id="signup-password-visibility-toggle"
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink cursor-pointer"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {capsLockActive && (
                        <p className="text-xs font-medium text-warn">Caps Lock is active</p>
                      )}
                      {password.length > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                          {[
                            { ok: policyLength, label: "12+ characters" },
                            { ok: policyUpper && policyLower, label: "Upper & lower case" },
                            { ok: policyNumber, label: "Includes number" },
                            { ok: policySpecial, label: "Special symbol" },
                          ].map((rule) => (
                            <span
                              key={rule.label}
                              className={`inline-flex items-center gap-1.5 ${
                                rule.ok ? "text-ok font-medium" : "text-muted"
                              }`}
                            >
                              <Check size={12} className={rule.ok ? "opacity-100" : "opacity-30"} />
                              <span>{rule.label}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {errors.password && (
                        <p id="signup-password-error" className="text-xs text-error">
                          {errors.password}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="confirmPassword" className="block text-xs font-medium text-ink">
                        Confirm password
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="••••••••••••"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (touched.confirmPassword) {
                              validateField("confirmPassword", e.target.value);
                            }
                          }}
                          onBlur={() => {
                            setTouched((t) => ({ ...t, confirmPassword: true }));
                            validateField("confirmPassword", confirmPassword);
                          }}
                          aria-invalid={!!errors.confirmPassword}
                          className={`h-10 w-full rounded-md border bg-panel pl-9 pr-10 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                            errors.confirmPassword ? "border-error" : "border-border"
                          }`}
                        />
                        <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <button
                          id="signup-confirm-password-visibility-toggle"
                          type="button"
                          onClick={() => setShowConfirmPassword((s) => !s)}
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink cursor-pointer"
                        >
                          {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errors.confirmPassword && (
                        <p id="signup-confirm-error" className="text-xs text-error">
                          {errors.confirmPassword}
                        </p>
                      )}
                    </div>

                    <button
                      id="signup-submit-btn"
                      type="submit"
                      disabled={loading}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-on-ink transition-colors hover:bg-ink/90 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Creating account…</span>
                        </>
                      ) : (
                        <>
                          <span>Create workspace account</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>

                    <div className="relative my-3">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-panel px-2.5 text-muted">or</span>
                      </div>
                    </div>

                    <button
                      id="signup-google-btn"
                      type="button"
                      onClick={() => {
                        window.location.href = `${API_URL}/v1/auth/google`;
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-pill border border-glass-border bg-glass px-4 text-sm font-medium text-ink transition-colors hover:bg-ink/10 cursor-pointer"
                    >
                      <GoogleIcon className="h-4 w-4" />
                      <span>Continue with Google</span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
