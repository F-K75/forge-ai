import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  AlertCircle,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuthStore, API_URL } from "../store/authStore";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import ForgeScene3D from "../components/three/ForgeScene3D";

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

  const handleQuickAdminSignIn = async () => {
    const adminEmail = "admin@forge.ai";
    const adminPass = "AdminPass123!";
    setEmail(adminEmail);
    setPassword(adminPass);
    setErrors({});
    setLoading(true);
    try {
      const result = await login(adminEmail, adminPass);
      if (result && "mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        return;
      }
      navigate("/admin-console", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrors({
        form: detail || "Unable to sign in as admin. Please verify credentials.",
      });
    } finally {
      setLoading(false);
    }
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
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrors({
        form:
          detail ||
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
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMfaError(detail || "The code you entered is invalid. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const emailErrorId = errors.email ? "email-error" : undefined;
  const passwordErrorId = errors.password ? "password-error" : undefined;
  const formErrorId = errors.form ? "form-error" : undefined;
  const mfaErrorId = mfaError ? "mfa-error" : undefined;

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="h-16 border-b border-border bg-panel">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/home" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <BrandLogo size="sm" />
            <span className="font-display text-base font-semibold tracking-tight text-ink">
              Forge AI
            </span>
          </Link>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-muted"
          >
            <Link to="/home" className="whitespace-nowrap hover:text-ink transition-colors">
              Home
            </Link>
            <Link to="/projects" className="whitespace-nowrap hover:text-ink transition-colors">
              Projects
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
              to="/signup"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-panel px-3.5 text-sm font-medium text-ink transition-colors hover:bg-panel-alt"
            >
              <span>Create account</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Split Studio Gateway */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Left: Clean Authentication Form */}
          <section className="lg:col-span-5 flex flex-col justify-center">
            <div className="rounded-xl border border-border bg-panel p-6 sm:p-8 shadow-apple">
              <div className="mb-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
                  {mfaToken ? "Two-factor verification" : "Sign in to Forge AI"}
                </h1>
                <p className="mt-1.5 text-sm text-muted">
                  {mfaToken
                    ? "Enter the 6-digit verification code from your authenticator app."
                    : "Access your autonomous workspaces, agent fleet, and review pipelines."}
                </p>
              </div>

              {mfaToken ? (
                <form id="mfa-form" onSubmit={handleMfaSubmit} noValidate className="space-y-4">
                  {mfaError && (
                    <div
                      id="mfa-error"
                      role="alert"
                      aria-live="assertive"
                      className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 p-3 text-xs font-medium text-error"
                    >
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span>{mfaError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="mfa-code" className="block text-xs font-medium text-ink">
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
                      className="h-11 w-full rounded-md border border-border bg-panel px-4 text-center font-mono text-lg tracking-[0.3em] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>

                  <button
                    id="mfa-submit-btn"
                    type="submit"
                    disabled={loading || !mfaCode.trim()}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-on-ink transition-colors hover:bg-ink/90 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      <>
                        <span>Verify &amp; continue</span>
                        <ArrowRight size={15} />
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
                    className="w-full py-1 text-center text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    Return to sign in
                  </button>
                </form>
              ) : (
                <form
                  id="auth-form"
                  aria-describedby={formErrorId}
                  onSubmit={handleSubmit}
                  noValidate
                  className="space-y-4"
                >
                  {errors.form && (
                    <div
                      id="form-error"
                      role="alert"
                      aria-live="assertive"
                      className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 p-3 text-xs font-medium text-error"
                    >
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span>{errors.form}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-xs font-medium text-ink">
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
                            setErrors((er) => ({
                              ...er,
                              email: validateEmail(e.target.value),
                            }));
                          }
                        }}
                        onBlur={() => {
                          setTouched((t) => ({ ...t, email: true }));
                          setErrors((er) => ({ ...er, email: validateEmail(email) }));
                        }}
                        aria-invalid={!!errors.email}
                        aria-describedby={emailErrorId}
                        className={`h-10 w-full rounded-md border bg-panel pl-9 pr-3.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                          errors.email ? "border-error" : "border-border"
                        }`}
                      />
                      <Mail
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                        aria-hidden="true"
                      />
                    </div>
                    {errors.email && (
                      <p id="email-error" className="flex items-center gap-1 text-xs text-error">
                        <AlertCircle size={12} />
                        <span>{errors.email}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="block text-xs font-medium text-ink">
                        Password
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-xs font-medium text-accent hover:underline"
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
                        className={`h-10 w-full rounded-md border bg-panel pl-9 pr-10 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
                          errors.password ? "border-error" : "border-border"
                        }`}
                      />
                      <Lock
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                        aria-hidden="true"
                      />
                      <button
                        id="password-visibility-toggle"
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {capsLockActive && (
                      <p className="text-xs font-medium text-warn">Caps Lock is active</p>
                    )}
                    {errors.password && (
                      <p id="password-error" className="flex items-center gap-1 text-xs text-error">
                        <AlertCircle size={12} />
                        <span>{errors.password}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <label className="inline-flex items-center gap-2 text-xs text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border accent-accent"
                      />
                      <span>Keep me signed in</span>
                    </label>
                  </div>

                  {/* Primary Submit Button (first "Sign in" button in DOM for form submission & tests) */}
                  <button
                    id="auth-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-on-ink transition-colors hover:bg-ink/90 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        <span>Sign in</span>
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>

                  {/* Quick Workspace Access: Admin & Demo */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      id="auth-admin-signin-btn"
                      type="button"
                      onClick={handleQuickAdminSignIn}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-border bg-panel-alt px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-high cursor-pointer"
                      title="Sign in directly with Admin privileges (admin@forge.ai)"
                    >
                      <ShieldCheck size={14} className="text-accent" />
                      <span>Sign in as Admin</span>
                    </button>
                    <button
                      id="auth-demo-fill-btn"
                      type="button"
                      onClick={handleQuickDemoFill}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-border bg-panel px-3 text-xs font-medium text-muted transition-colors hover:bg-panel-alt hover:text-ink cursor-pointer"
                    >
                      <Sparkles size={13} className="text-accent" />
                      <span>Auto-fill Demo</span>
                    </button>
                  </div>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-panel px-2.5 text-muted">or</span>
                    </div>
                  </div>

                  <button
                    id="auth-google-btn"
                    type="button"
                    onClick={() => {
                      window.location.href = `${API_URL}/v1/auth/google`;
                    }}
                    className="inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-panel px-4 text-sm font-medium text-ink transition-colors hover:bg-panel-alt cursor-pointer"
                  >
                    <GoogleIcon className="h-4 w-4" />
                    <span>Continue with Google</span>
                  </button>

                  <p className="pt-2 text-center text-xs text-muted">
                    New to Forge AI?{" "}
                    <Link to="/signup" className="font-medium text-accent hover:underline">
                      Create an account
                    </Link>
                  </p>
                </form>
              )}
            </div>
          </section>

          {/* Right: Live Interactive Three.js 3D Architecture Showcase */}
          <aside className="hidden lg:flex lg:col-span-7 flex-col overflow-hidden rounded-xl border border-border bg-panel-alt shadow-apple">
            <div className="flex-1 min-h-[480px] w-full">
              <ForgeScene3D
                mode="embedded"
                initialFinish="blueprint"
                initialPreset="orbit"
                showControls
              />
            </div>
            <div className="border-t border-border bg-ink px-6 py-4 text-muted">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-sm font-semibold text-ink">
                    Deterministic Multi-Agent Runtime
                  </h2>
                  <p className="mt-0.5 text-xs text-faint">
                    Click any specialist node in the 3D topology above to inspect live build roles.
                  </p>
                </div>
                <span className="font-mono text-xs text-faint tabular-nums">
                  TLS 1.3 · RBAC Enforced
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
